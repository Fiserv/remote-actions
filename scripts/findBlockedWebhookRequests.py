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

MOST_RECENTLY_PROCESSED_BASE_FILEPATH = "webhooks/most_recently_processed"
MOST_RECENTLY_PROCESSED_FILEPATH = ""

env = ""
def main():
    env = sys.argv[1]
    if len(sys.argv) != 2 or env not in WEBHOOK_URLS:
        print("Usage: findBlockedWebhookRequests.py [dev|qa|stage|prod]")
        sys.exit(1)

    env = sys.argv[1]
    target_url = WEBHOOK_URLS[env]

    MOST_RECENTLY_PROCESSED_FILEPATH = f"{MOST_RECENTLY_PROCESSED_BASE_FILEPATH}_{env}.json"
    
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

    #deliveries = get_sorted_deliveries_with_details(all_deliveries, deliveries_url)

    # Step 4: Find blocked webhooks
    num_blocked = 0
    most_recently_processed_delivery = {}
    for delivery_obj in deliveries:
        delivery = delivery_obj["delivery"]
        detail = delivery_obj["details"]
        headers = detail.get("request", {}).get("headers", {})
        gitHubDeliveryId = headers.get("X-GitHub-Delivery")
        
        if not delivery_needs_processing(delivery_obj, env):
            continue

        statusCode = delivery.get("status_code")
        if statusCode == 200:
            num_blocked += 1
            # Retrieve the delivery details and gather relevant information
            responsePayload = detail.get("response", {}).get("payload", {})
            requestPayload = detail.get("request", {}).get("payload", {})
            # Regular expressions to extract the values required by security team to find the offending text in the request
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

        most_recently_processed_delivery = delivery_obj
        update_most_recently_processed(most_recently_processed_delivery)

    print(f"Total number of blocked webhooks: {num_blocked}")

    detail = most_recently_processed_delivery["details"]
    headers = detail.get("request", {}).get("headers", {})
    gitHubDeliveryId = headers.get("X-GitHub-Delivery")
    timestamp = most_recently_processed_delivery["timestamp"]
    delivery_date = printable_date_time(detail)
    print(f"Most recent processed delivery -- id: {gitHubDeliveryId}, timestamp: {delivery_date}, timestamp: {timestamp}")

def fetch_all_deliveries(deliveries_url):
  per_page = 100  # Max is 100
  next_url = deliveries_url + f"?per_page={per_page}"
  all_deliveries_with_details = []

  while next_url:
      response = requests.get(next_url, headers=HEADERS)
      deliveries = response.json()
      deliveries_with_details = []
      for delivery in deliveries:
        delivery_id = delivery.get("id")
        detail_url = f"{deliveries_url}/{delivery_id}"
        details = requests.get(detail_url, headers=HEADERS).json()
        headers = details.get("request", {}).get("headers", {})
        gitHubDeliveryId = headers.get("X-GitHub-Delivery")
        payload = details.get("request", {}).get("payload", {})
        head_commit = payload.get("head_commit", {})
        if head_commit:
          timestamp = head_commit.get("timestamp")
          epoch_timestamp = datetime.fromisoformat(timestamp).astimezone().timestamp()
          print(f"Found head_commit for delivery id {gitHubDeliveryId}, timestamp: {datetime.fromtimestamp(get_delivery_timestamp(details))}")
          deliveries_with_details.append({
            "delivery": delivery,
            "details": details,
            "timestamp": epoch_timestamp
          })
          all_deliveries_with_details.extend(deliveries_with_details)
        else:
          print(f"Skipping delivery {gitHubDeliveryId} with no head_commit")

      print(f"Added {len(deliveries_with_details)} deliveries")

      # Get the URL for the next page of deliveries
      link_header = response.headers.get("Link", "")
      next_url = None
      if 'rel="next"' in link_header:
          parts = link_header.split(",")
          for part in parts:
              if 'rel="next"' in part:
                  next_url = part.split(";")[0].strip().strip("<>")
                  break

  return all_deliveries_with_details

"""
get_delivery_timestamp takes a delivery detail object and extracts the timestamp from the head_commit.
The timestamp from the head_commit is the timestamp of the most recent commit in the push that triggered the webhook.
It is not the timestamp of the delivery itself -- this is not available in the GitHub API or the webhook payload.
"""
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
    timestamp = head_commit.get("timestamp")
    if not timestamp:
        print("No timestamp found in delivery")
        return None
    try:
        # Parse ISO 8601 timestamp to aware datetime
        dt = datetime.fromisoformat(timestamp)
        # Normalize to local time
        local_dt = dt.astimezone()
        epoch_timestamp = local_dt.timestamp()
        return epoch_timestamp
    except Exception:
        print(f"Invalid timestamp format: {timestamp}")
        return None

def printable_date_time(detail):
    """
    Returns a local datetime object for the delivery detail's head_commit timestamp.
    """
    epoch_timestamp = get_delivery_timestamp(detail)
    if epoch_timestamp is None:
        return None
    return datetime.fromtimestamp(epoch_timestamp)

def get_sorted_deliveries_with_details(all_deliveries, deliveries_url):
    """
    Filters out deliveries without a head_commit/timestamp, fetches details,
    and returns a list of dicts with 'delivery' and 'details', sorted by timestamp (oldest first).
    """
    deliveries_with_details = []
    for delivery in all_deliveries:
        delivery_id = delivery.get("id")
        detail_url = f"{deliveries_url}/{delivery_id}"
        details = requests.get(detail_url, headers=HEADERS).json()
        headers = details.get("request", {}).get("headers", {})
        gitHubDeliveryId = headers.get("X-GitHub-Delivery")
        payload = details.get("request", {}).get("payload", {})
        head_commit = payload.get("head_commit", {})
        if head_commit:
            timestamp = head_commit.get("timestamp")
            epoch_timestamp = datetime.fromisoformat(timestamp).astimezone().timestamp()
            print(f"Found head_commit for delivery id {gitHubDeliveryId}, timestamp: {datetime.fromtimestamp(get_delivery_timestamp(details))}")
            deliveries_with_details.append({
                "delivery": delivery,
                "details": details,
                "timestamp": epoch_timestamp
            })
            response = details.get("response", {})
            print(f"response: {response}")

        else:
            print(f"Skipping delivery {gitHubDeliveryId} with no head_commit")

    # Sort by timestamp (oldest first)
    deliveries_with_details.sort(key=lambda x: x["timestamp"])

    return [{"delivery": d["delivery"], "details": d["details"], "timestamp": d["timestamp"]} for d in deliveries_with_details]

def read_most_recently_processed():
  try:
    with open(MOST_RECENTLY_PROCESSED_FILEPATH, "r") as f:
      data = json.load(f)
    return {
      "delivery_id": data.get("delivery_id"),
      "timestamp": data.get("timestamp")
    }
  except FileNotFoundError:
    print(f"File not found: {MOST_RECENTLY_PROCESSED_FILEPATH}")
    return {"delivery_id": None, "timestamp": 0}
  except json.JSONDecodeError:
    print(f"Invalid JSON in file: {MOST_RECENTLY_PROCESSED_FILEPATH}")
    return {"delivery_id": None, "timestamp": 0}
  except Exception as e:
   print(f"Error reading {MOST_RECENTLY_PROCESSED_FILEPATH}: {e}")
   return {"delivery_id": None, "timestamp": 0}

def update_most_recently_processed(most_recently_processed_delivery):
  detail = most_recently_processed_delivery["details"]
  headers = detail.get("request", {}).get("headers", {})
  gitHubDeliveryId = headers.get("X-GitHub-Delivery")
  timestamp = most_recently_processed_delivery["timestamp"]
  delivery_date = printable_date_time(detail)
  print(f"Most recent processed delivery set to -- id: {gitHubDeliveryId}, date-time: {delivery_date}, timestamp: {timestamp}")

  with open(MOST_RECENTLY_PROCESSED_FILEPATH, "w") as f:
    json.dump({"delivery_id": gitHubDeliveryId, "timestamp": ts}, f)

def delivery_needs_processing(delivery, details):
  headers = details.get("request", {}).get("headers", {})
  id = headers.get("X-GitHub-Delivery")
  timestamp = delivery_obj["timestamp"]

  most_recently_processed_data = read_most_recently_processed()
  most_recently_processed_timestamp = most_recently_processed_data.get('timestamp', 0)

  try:
    most_recently_processed_timestamp = float(most_recently_processed_timestamp)
  except (TypeError, ValueError):
    most_recently_processed_timestamp = 0.0

  if timestamp > most_recently_processed_timestamp:
    print(f"Delivery {id} ({printable_date_time(details)}) needs processing (timestamp: {timestamp} > most recent timestamp: {most_recently_processed_timestamp})")
    return True

  print(f"Delivery {id} ({printable_date_time(details)}) does not need processing (timestamp: {timestamp} <= most recent timestamp: {most_recently_processed_timestamp})")
  return False
 

if __name__ == "__main__":
    main()
