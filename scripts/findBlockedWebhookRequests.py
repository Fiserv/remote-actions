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
TIMED_OUT_DELIVERIES_BASE_FILEPATH = "webhooks/timed_out_deliveries"

def main():
    env = sys.argv[1]
    if len(sys.argv) != 2 or env not in WEBHOOK_URLS:
        print(f"Error: {env} not in {WEBHOOK_URLS}")
        print("Usage: findBlockedWebhookRequests.py [dev|qa|stage|prod]")
        sys.exit(1)

    env = sys.argv[1]
    target_url = WEBHOOK_URLS[env]

    most_recently_processed_filepath = f"{MOST_RECENTLY_PROCESSED_BASE_FILEPATH}_{env}.json"
    today_str = datetime.now().strftime("%m-%d-%Y")
    timed_out_filepath = f"{TIMED_OUT_DELIVERIES_BASE_FILEPATH}_{today_str}_{env}.json"

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

    # Step 4: Find blocked webhooks
    num_blocked = 0
    most_recently_processed_delivery = {}
    num_processed = 0
    most_recently_processed_data = read_most_recently_processed(most_recently_processed_filepath)
    last_most_recently_processed_timestamp = most_recently_processed_data.get('timestamp', 0)

    print(f"Total deliveries to process: {len(deliveries)}")
    for current_delivery_obj in deliveries:
        
        current_delivery = current_delivery_obj["delivery"]
        current_delivery_detail = current_delivery_obj["details"]
        response = current_delivery_detail.get("response", {})

        headers = current_delivery_detail.get("request", {}).get("headers", {})
        gitHubDeliveryId = headers.get("X-GitHub-Delivery")
        
        print(f"Processing delivery id: {gitHubDeliveryId}")

        # Determine if the delivery is newer than the last-most-recently-processed delivery
        if not delivery_needs_processing(last_most_recently_processed_timestamp, current_delivery_obj):
            continue

        # Check for deliveries that timed out (empty response)
        if response.get("headers", {}) == {} and response.get("payload", "") == "":
          print(f"Delivery {gitHubDeliveryId} timed out (empty response).")
          save_timeout_delivery(current_delivery_obj, timed_out_filepath)
          continue

        statusCode = current_delivery.get("status_code")
        if statusCode == 200:
            num_blocked += 1
            # Retrieve the delivery details and gather relevant information
            responsePayload = current_delivery_detail.get("response", {}).get("payload", {})
            requestPayload = current_delivery_detail.get("request", {}).get("payload", {})
            # Regular expressions to extract the values required by security team to find the offending text in the request
            transid = re.search(r"_event_transid='([^']+)'", responsePayload)
            clientip = re.search(r"_event_clientip='([^']+)'", responsePayload)
            clientport = re.search(r"_event_clientport='([^']+)'", responsePayload)
            # Log applicable information
            print("************** Blocked webhook request **************")
            print(f"webhook: {target_url}")
            print(f"GitHub delivery Id: {gitHubDeliveryId}")
            print("Timestamp: " + get_delivery_timestamp(current_delivery_detail))
            print("transid:", transid.group(1) if transid else None)
            print("clientip:", clientip.group(1) if clientip else None)
            print("clientport:", clientport.group(1) if clientport else None)
            print("request payload: " + json.dumps(requestPayload, indent=4))
            print("*****************************************************")

        if not most_recently_processed_delivery or get_delivery_timestamp(current_delivery_detail) > most_recently_processed_delivery["timestamp"]:
          most_recently_processed_delivery = current_delivery_obj
          update_most_recently_processed(most_recently_processed_filepath, most_recently_processed_delivery)

        num_processed += 1
        print(f"Processed {num_processed} deliveries so far...")

    print(f"Total number of deliveries processed: {num_processed}")
    print(f"Total number of blocked webhooks: {num_blocked}")

    if num_processed > 0:
      current_delivery_detail = most_recently_processed_delivery["details"]
      headers = current_delivery_detail.get("request", {}).get("headers", {})
      gitHubDeliveryId = headers.get("X-GitHub-Delivery")
      timestamp = most_recently_processed_delivery["timestamp"]
      delivery_date = printable_date_time(current_delivery_detail)
      print(f"Most recent processed delivery -- id: {gitHubDeliveryId}, timestamp: {delivery_date}, timestamp: {timestamp}")

def save_timeout_delivery(delivery, timed_out_filepath):
  details = delivery["details"]
  headers = details.get("request", {}).get("headers", {})
  delivery_id = headers.get("X-GitHub-Delivery")
  payload = details.get("request", {}).get("payload", {})
  timestamp = get_delivery_timestamp(details)

  print(f"Delivery {delivery_id} timed out. Updating {timed_out_filepath}")

  record = {
    "delivery_id": delivery_id,
    "payload": payload,
    "timestamp": timestamp
  }

  try:
    with open(timed_out_filepath, "r") as f:
      data = json.load(f)
      if not isinstance(data, list):
        data = []
  except (FileNotFoundError, json.JSONDecodeError):
    data = []

  # Only append if delivery_id is not already present
  if not any(r.get("delivery_id") == delivery_id for r in data):
    data.append(record)
    with open(timed_out_filepath, "w") as f:
      json.dump(data, f, indent=4)
  else:
    print(f"Delivery {delivery_id} already present in {timed_out_filepath}, skipping.")

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
        signature =  headers.get("X-Hub-Signature-256")
        payload = details.get("request", {}).get("payload", {})
        head_commit = payload.get("head_commit", {})
        if head_commit:
          timestamp = head_commit.get("timestamp")
          epoch_timestamp = datetime.fromisoformat(timestamp).astimezone().timestamp()
          print(f"Found head_commit for delivery id {gitHubDeliveryId}, timestamp: {datetime.fromtimestamp(get_delivery_timestamp(details))}")
          print(f"signature: {signature}, delivery id: {gitHubDeliveryId}")
          deliveries_with_details.append({
            "delivery": delivery,
            "details": details,
            "timestamp": epoch_timestamp
          })
        else:
          print(f"Skipping delivery {gitHubDeliveryId} with no head_commit")

      print(f"Adding {len(deliveries_with_details)} deliveries")
      all_deliveries_with_details.extend(deliveries_with_details)
      print(f"Total deliveries so far: {len(all_deliveries_with_details)}")

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

def read_most_recently_processed(most_recently_processed_filepath):
  try:
    print(f"Reading most recently processed information from {most_recently_processed_filepath}")
    with open(most_recently_processed_filepath, "r") as f:
      data = json.load(f)
    return {
      "delivery_id": data.get("delivery_id"),
      "timestamp": data.get("timestamp")
    }
  except FileNotFoundError:
    print(f"File not found: {most_recently_processed_filepath}")
    return {"delivery_id": None, "timestamp": 0}
  except json.JSONDecodeError:
    print(f"Invalid JSON in file: {most_recently_processed_filepath}")
    return {"delivery_id": None, "timestamp": 0}
  except Exception as e:
   print(f"Error reading {most_recently_processed_filepath}: {e}")
   return {"delivery_id": None, "timestamp": 0}

def update_most_recently_processed(most_recently_processed_filepath, most_recently_processed_delivery):
  detail = most_recently_processed_delivery["details"]
  headers = detail.get("request", {}).get("headers", {})
  gitHubDeliveryId = headers.get("X-GitHub-Delivery")
  timestamp = most_recently_processed_delivery["timestamp"]
  delivery_date = printable_date_time(detail)
  delivery_date_str = delivery_date.isoformat() if delivery_date else None
  print(f"Most recent processed delivery set to -- id: {gitHubDeliveryId}, date-time: {delivery_date_str}, timestamp: {timestamp}")

  with open(most_recently_processed_filepath, "w") as f:
    json.dump({"delivery_id": gitHubDeliveryId, "delivery date-time": delivery_date_str, "timestamp": timestamp}, f, indent=4)

def delivery_needs_processing(most_recently_processed_timestamp, delivery):
  details = delivery["details"]
  headers = details.get("request", {}).get("headers", {})
  id = headers.get("X-GitHub-Delivery")
  timestamp = delivery["timestamp"]

  try:
    most_recently_processed_timestamp = float(most_recently_processed_timestamp)
  except (TypeError, ValueError):
    print(f"Invalid most_recently_processed_timestamp: {most_recently_processed_timestamp}, defaulting to 0.0")
    most_recently_processed_timestamp = 0.0

  if timestamp > most_recently_processed_timestamp:
    print(f"Delivery {id} ({printable_date_time(details)}) needs processing (timestamp: {timestamp} > most recent timestamp: {most_recently_processed_timestamp})")
    return True

  print(f"Delivery {id} ({printable_date_time(details)}) does not need processing (timestamp: {timestamp} <= most recent timestamp: {most_recently_processed_timestamp})")
  return False
 

if __name__ == "__main__":
    main()
