import sys
import requests
import os
import json
import re
from datetime import datetime

# Map environments to webhook URLs
WEBHOOK_URLS = {
    "dev": "https://dev-developer.fiserv.com/api/git-webhook",
    "qa": "https://qa-developer.fiserv.com/api/git-webhook",
    "stage": "https://stage-developer.fiserv.com/api/git-webhook",
    "prod": "https://developer.fiserv.com/api/git-webhook"
}

# GitHub API setup
GITHUB_TOKEN = os.getenv("GITHUB_TENANT_REPO_AUTH_TOKEN")  # Set this in your environment
HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json"
}

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in WEBHOOK_URLS:
        print("Usage: findBlockedWebhookRequests.py [dev|qa|stage|prod]")
        sys.exit(1)

    env = sys.argv[1]
    target_url = WEBHOOK_URLS[env]

    # Step 1: Get all Fiserv org webhooks
    hooks_url = f"https://api.github.com/orgs/Fiserv/hooks"
    hooks = requests.get(hooks_url, headers=HEADERS).json()

    # Step 2: Find the webhook matching the target URL
    hook = next((h for h in hooks if h['config'].get('url') == target_url), None)
    if not hook:
        print(f"No webhook found for URL: {target_url}")
        sys.exit(1)

    hook_id = hook["id"]

    print(f"Found webhook id for {target_url}: {hook_id}")

    # Step 3: Get deliveries for the webhook
    deliveries_url = f"https://api.github.com/orgs/Fiserv/hooks/{hook_id}/deliveries"
    deliveries = fetch_all_deliveries(deliveries_url)
    print(f"Total number of deliveries: {len(deliveries)}")

    # Step 4: Find blocked webhooks
    num_blocked = 0
    most_recent_delivery = {}
    for delivery in deliveries:
      delivery_id = delivery["id"]
      detail_url = f"{deliveries_url}/{delivery_id}"
      detail = requests.get(detail_url, headers=HEADERS).json()
      print(f"Processing delivery id: {delivery_id}")
      delivery_ts = get_delivery_timestamp(detail)
      if delivery_ts:
        print(f"Delivery timestamp: {delivery_ts}")
      if delivery_ts and (not "ts" in most_recent_delivery or (most_recent_delivery["ts"] is None or delivery_ts > most_recent_delivery["ts"])):
        print("Updating most recent delivery")
        most_recent_delivery["ts"] = delivery_ts
        most_recent_delivery["id"] = delivery_id
        print(f"Most recent delivery updated to id: {most_recent_delivery["id"]}, {most_recent_delivery["ts"]}")

        print("Determing if this delivery is blocked...")

        statusCode = delivery.get("status_code")
        if statusCode == 200:
          num_blocked += 1

          # Retrieve the delivery details and gather relevant information
          headers = detail.get("request", {}).get("headers", {})
          gitHubDeliveryId = headers.get("X-GitHub-Delivery")
          responsePayload = detail.get("response", {}).get("payload", {})
          requestPayload = detail.get("request", {}).get("payload", {})
 
          # Regular expressions to extract the values required by security
          # team to find the offending text in the request
          transid = re.search(r"_event_transid='([^']+)'", responsePayload)
          clientip = re.search(r"_event_clientip='([^']+)'", responsePayload)
          clientport = re.search(r"_event_clientport='([^']+)'", responsePayload)
 
          # Log applicable information
          print("************** Blocked webhook request **************")
          print(f"webhook: {target_url}")
          print(f"GitHub delivery Id: {gitHubDeliveryId}")
          print("Timestamp: " + requestPayload.get("head_commit", {}).get("timestamp", {}))
          print("transid:", transid.group(1) if transid else None)
          print("clientip:", clientip.group(1) if clientip else None)
          print("clientport:", clientport.group(1) if clientport else None)
          print("request payload: " + json.dumps(requestPayload, indent=4))
          print("*****************************************************")
 
    print(f"Total number of blocked webhooks: {num_blocked}")

def fetch_all_deliveries(deliveries_url):
  per_page = 100  # Max is 100
  next_url = deliveries_url + f"?per_page={per_page}"
  all_deliveries = []

  while next_url:
      response = requests.get(next_url, headers=HEADERS)
      deliveries = response.json()
      all_deliveries.extend(deliveries)

      print(f"Added {len(deliveries)} deliveries")

      # Get the URL for the next page of deliveries
      link_header = response.headers.get("Link", "")
      next_url = None
      if 'rel="next"' in link_header:
          parts = link_header.split(",")
          for part in parts:
              if 'rel="next"' in part:
                  next_url = part.split(";")[0].strip().strip("<>")
                  break

  return all_deliveries

def get_delivery_timestamp(detail):
    """
    Extracts and parses the timestamp from a delivery object.
    Returns the local time epoch timestamp (float) or None if not found/invalid.
    Also prints the normalized local datetime for clarity.
    """
    requestPayload = detail.get("request", {}).get("payload", {})
    head_commit = requestPayload.get("head_commit", {})
    if not head_commit:
        print("No head_commit found in delivery")
        return None
    ts = head_commit.get("timestamp")
    if not ts:
        print("No timestamp found in delivery")
        return None
    try:
        # Parse ISO 8601 timestamp to aware datetime
        dt = datetime.fromisoformat(ts)
        # Normalize to local time
        local_dt = dt.astimezone()
        print(f"Delivery date-time: {local_dt}")
        epoch_ts = local_dt.timestamp()
        return epoch_ts
    except Exception:
        print(f"Invalid timestamp format: {ts}")
        return None


def is_newest_delivery(current_delivery, deliveries):
    """
    Returns True if current_delivery is the newest (most recent) among deliveries.
    """
    current_ts = get_delivery_timestamp(current_delivery)
    if not current_ts:
        return False
    for delivery in deliveries:
        if delivery is current_delivery:
            continue
        ts = get_delivery_timestamp(delivery)
        if ts and ts > current_ts:
            return False
    return True

def get_most_recent_deliveryTs(filename="newest_timestamp.json"):
    """
    Reads the most recent delivery timestamp from a JSON file and returns it as a datetime object.
    Handles missing file and invalid structure gracefully.
    """
    try:
        with open(filename, "r") as f:
            data = json.load(f)
        ts = data.get("timestamp")
        if not ts or not isinstance(ts, str):
            print(f"Warning: {filename} missing or invalid 'timestamp' field.")
            return None
        try:
            return datetime.fromisoformat(ts)
        except Exception:
            print(f"Warning: Invalid timestamp format in {filename}: {ts}")
            return None
    except FileNotFoundError:
        print(f"Info: {filename} not found. No previous timestamp available.")
        return None
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        return None
  

def needs_processing(delivery, most_recent_delivery, lastProcessedTs):
    """
    Returns True if delivery's timestamp is newer than lastProcessedTs.
    """
    ts = get_delivery_timestamp(delivery)
    if ts and (not "ts" in most_recent_delivery or (most_recent_delivery["ts"] is None or delivery_ts > most_recent_delivery["ts"])):
      return True
    
    return False

if __name__ == "__main__":
    main()
