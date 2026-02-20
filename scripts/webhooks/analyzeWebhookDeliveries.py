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

ENV_BRANCHES = {
    "dev": "develop",
    "qa": "develop",
    "stage": "stage",
    "prod": "main"
}

MOST_RECENTLY_PROCESSED_BASE_FILEPATH = "persistence/most_recently_processed"
TIMED_OUT_DELIVERIES_BASE_FILEPATH = "persistence/timed_out_deliveries"
BLOCKED_DELIVERIES_BASE_FILEPATH = "persistence/blocked_delivery"
ACTIVITY_LOG_BASE_FILEPATH = "persistence/activity_log"
GITHUB_DELIVERY_HEADER = "X-Github-Delivery"
DELIVERY_OBJECT_KEY = "delivery"
DETAILS_OBJECT_KEY = "details"
DELIVERY_DETAILS_REQUEST = "request"
DELIVERY_DETAILS_RESPONSE = "response"
DELIVERY_DETAILS_HEADERS = "headers"
DELIVERY_DETAILS_PAYLOAD = "payload"
TIMESTAMP_KEY = "timestamp"
PAYLOAD_HEAD_COMMIT_KEY = "head_commit"
SIGNATURE_HEADER = "X-Hub-Signature-256"

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
    blocked_delivery_filepath = f"{BLOCKED_DELIVERIES_BASE_FILEPATH}_{today_str}_{env}"
    activity_log_filepath = f"{ACTIVITY_LOG_BASE_FILEPATH}_{today_str}_{env}.log"

    # Step 1: Get all Fiserv org webhooks
    hooks_url = f"https://api.github.com/orgs/Fiserv/hooks"
    hooks = requests.get(hooks_url, headers=HEADERS).json()

    # Step 2: Find the webhook matching the URL corresponding to the specified environment
    hook = next((h for h in hooks if h['config'].get('url') == target_url), None)
    if not hook:
        update_activity_log(f"No webhook found for URL: {target_url}", activity_log_filepath)
        sys.exit(1)

    hook_id = hook["id"]

    update_activity_log(f"Found webhook id for {target_url}: {hook_id}", activity_log_filepath)

    # Step 3: Get deliveries for the webhook
    deliveries_url = f"https://api.github.com/orgs/Fiserv/hooks/{hook_id}/deliveries"
    deliveries = fetch_all_deliveries(deliveries_url, activity_log_filepath)

    # Step 4: Find blocked webhooks
    num_timed_out = 0
    num_blocked = 0
    most_recently_processed_delivery = {}
    num_processed = 0
    most_recently_processed_data = read_most_recently_processed(most_recently_processed_filepath, activity_log_filepath)
    last_most_recently_processed_timestamp = most_recently_processed_data.get(TIMESTAMP_KEY, 0)

    update_activity_log(f"Total deliveries to process: {len(deliveries)}", activity_log_filepath)
    for current_delivery_obj in deliveries:
        
        current_delivery = current_delivery_obj[DELIVERY_OBJECT_KEY]
        current_delivery_detail = current_delivery_obj[DETAILS_OBJECT_KEY]
        response = current_delivery_detail.get(DELIVERY_DETAILS_RESPONSE, {})

        headers = current_delivery_detail.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_HEADERS, {})
        gitHubDeliveryId = headers.get(GITHUB_DELIVERY_HEADER)
        
        update_activity_log(f"Processing delivery id: {gitHubDeliveryId}", activity_log_filepath)

        # Determine if the delivery is newer than the last-most-recently-processed delivery
        if not delivery_needs_processing(last_most_recently_processed_timestamp, current_delivery_obj, activity_log_filepath):
            continue

        # Check for deliveries that timed out (empty response)
        if response.get(DELIVERY_DETAILS_HEADERS, {}) == {} and response.get(DELIVERY_DETAILS_PAYLOAD, "") == "":
            if handle_timeout_delivery(current_delivery_obj, timed_out_filepath, env, activity_log_filepath):
                num_timed_out += 1
            continue

        statusCode = current_delivery.get("status_code")
        if statusCode == 200:
            num_blocked += 1
            save_blocked_delivery(blocked_delivery_filepath, target_url, gitHubDeliveryId, current_delivery_detail, activity_log_filepath)

        if not most_recently_processed_delivery or get_delivery_timestamp(current_delivery_detail, activity_log_filepath) > most_recently_processed_delivery[TIMESTAMP_KEY]:
          most_recently_processed_delivery = current_delivery_obj
          update_most_recently_processed(most_recently_processed_filepath, most_recently_processed_delivery, activity_log_filepath)

        num_processed += 1
        update_activity_log(f"Processed {num_processed} deliveries so far...", activity_log_filepath)

    update_activity_log(f"Total number of deliveries processed: {num_processed}", activity_log_filepath)
    update_activity_log(f"Total number of blocked webhooks: {num_blocked}", activity_log_filepath)
    update_activity_log(f"Total number of timed_out webhooks: {num_timed_out}", activity_log_filepath)

    if num_processed > 0:
      current_delivery_detail = most_recently_processed_delivery[DETAILS_OBJECT_KEY]
      headers = current_delivery_detail.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_HEADERS, {})
      gitHubDeliveryId = headers.get(GITHUB_DELIVERY_HEADER)
      timestamp = most_recently_processed_delivery[TIMESTAMP_KEY]
      delivery_date = printable_date_time(current_delivery_detail, activity_log_filepath)
      update_activity_log(f"Most recent processed delivery -- id: {gitHubDeliveryId}, timestamp: {delivery_date}, timestamp: {timestamp}", activity_log_filepath)

def update_activity_log(log_content, activity_log_filepath):
    print(f"{log_content}")
    with open(activity_log_filepath, "a") as f:
        f.write(log_content + "\n")
      
def save_blocked_delivery(blocked_delivery_filepath, target_url, gitHubDeliveryId, current_delivery_detail, activity_log_filepath):
    persistence_filename = f"{blocked_delivery_filepath}_{gitHubDeliveryId}.log"
    responsePayload = current_delivery_detail.get(DELIVERY_DETAILS_RESPONSE, {}).get(DELIVERY_DETAILS_PAYLOAD, {})
    requestPayload = current_delivery_detail.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_PAYLOAD, {})
    transid = re.search(r"_event_transid='([^']+)'", responsePayload)
    clientip = re.search(r"_event_clientip='([^']+)'", responsePayload)
    clientport = re.search(r"_event_clientport='([^']+)'", responsePayload)
    log_lines = [
        "************** Blocked webhook request **************",
        f"webhook: {target_url}",
        f"GitHub delivery Id: {gitHubDeliveryId}",
        "Timestamp: " + str(get_delivery_timestamp(current_delivery_detail, activity_log_filepath)),
        f"transid: {transid.group(1) if transid else None}",
        f"clientip: {clientip.group(1) if clientip else None}",
        f"clientport: {clientport.group(1) if clientport else None}",
        "request payload: " + json.dumps(requestPayload, indent=4),
        "*****************************************************"
    ]
    # Log to stdout and file
    with open(persistence_filename, "w") as f:
        for line in log_lines:
            f.write(line + "\n")

def handle_timeout_delivery(delivery, timed_out_filepath, env, activity_log_filepath):
  details = delivery[DETAILS_OBJECT_KEY]
  headers = details.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_HEADERS, {})
  delivery_id = headers.get(GITHUB_DELIVERY_HEADER)
  payload = details.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_PAYLOAD, {})
  branch = payload.get('ref', '').replace('refs/heads/', '')
  timestamp = get_delivery_timestamp(details, activity_log_filepath)

  if branch != ENV_BRANCHES[env]:
    update_activity_log(f"Skipping timed-out delivery {delivery_id} for branch '{branch}' not matching environment branch '{ENV_BRANCHES[env]}'", activity_log_filepath)
    return False

  update_activity_log(f"Delivery {delivery_id} timed out. Updating {timed_out_filepath}", activity_log_filepath)

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
    update_activity_log(f"Delivery {delivery_id} already present in {timed_out_filepath}, skipping.", activity_log_filepath)
  
  return True

def fetch_all_deliveries(deliveries_url, activity_log_filepath):
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
        headers = details.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_HEADERS, {})
        gitHubDeliveryId = headers.get(GITHUB_DELIVERY_HEADER)
        signature =  headers.get(SIGNATURE_HEADER)
        payload = details.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_PAYLOAD, {})
        head_commit = payload.get(PAYLOAD_HEAD_COMMIT_KEY, {})
        if head_commit:
          epoch_timestamp = get_delivery_timestamp(details, activity_log_filepath)
          update_activity_log(f"Found head_commit for delivery id {gitHubDeliveryId}, timestamp: {epoch_timestamp}, {datetime.fromtimestamp(epoch_timestamp)}", activity_log_filepath)
          update_activity_log(f"signature: {signature}, delivery id: {gitHubDeliveryId}", activity_log_filepath)
          deliveries_with_details.append({
            DELIVERY_OBJECT_KEY: delivery,
            DETAILS_OBJECT_KEY: details,
            TIMESTAMP_KEY: epoch_timestamp
          })
        else:
          update_activity_log(f"Skipping delivery {gitHubDeliveryId} with no head_commit", activity_log_filepath)

      update_activity_log(f"Adding {len(deliveries_with_details)} deliveries", activity_log_filepath)
      all_deliveries_with_details.extend(deliveries_with_details)
      update_activity_log(f"Total deliveries so far: {len(all_deliveries_with_details)}", activity_log_filepath)

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
def get_delivery_timestamp(detail, activity_log_filepath):
    """
    Extracts and parses the timestamp from a delivery object.
    Returns the local time epoch timestamp (float) or None if not found/invalid.
    Also prints the normalized local datetime for clarity.
    """
    requestPayload = detail.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_PAYLOAD, {})
    head_commit = requestPayload.get(PAYLOAD_HEAD_COMMIT_KEY, {})
    if not head_commit:
        update_activity_log("No head_commit found in delivery", activity_log_filepath)
        return None
    timestamp = head_commit.get(TIMESTAMP_KEY)
    if not timestamp:
        update_activity_log("No timestamp found in delivery", activity_log_filepath)
        return None
    try:
        # Parse ISO 8601 timestamp to aware datetime
        dt = datetime.fromisoformat(timestamp)
        # Normalize to local time
        local_dt = dt.astimezone()
        epoch_timestamp = local_dt.timestamp()
        return epoch_timestamp
    except Exception:
        update_activity_log(f"Invalid timestamp format: {timestamp}", activity_log_filepath)
        return None

def printable_date_time(detail, activity_log_filepath):
    """
    Returns a local datetime object for the delivery detail's head_commit timestamp.
    """
    epoch_timestamp = get_delivery_timestamp(detail, activity_log_filepath)
    if epoch_timestamp is None:
        return None
    return datetime.fromtimestamp(epoch_timestamp)

#def get_sorted_deliveries_with_details(all_deliveries, deliveries_url):
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

def read_most_recently_processed(most_recently_processed_filepath, activity_log_filepath):
  try:
    print(f"Reading most recently processed information from {most_recently_processed_filepath}")
    with open(most_recently_processed_filepath, "r") as f:
      data = json.load(f)
    return {
      "delivery_id": data.get("delivery_id"),
      "timestamp": data.get(TIMESTAMP_KEY)
    }
  except FileNotFoundError:
    update_activity_log(f"File not found: {most_recently_processed_filepath}", activity_log_filepath)
    return {"delivery_id": None, "timestamp": 0}
  except json.JSONDecodeError:
    update_activity_log(f"Invalid JSON in file: {most_recently_processed_filepath}", activity_log_filepath)
    return {"delivery_id": None, "timestamp": 0}
  except Exception as e:
   update_activity_log(f"Error reading {most_recently_processed_filepath}: {e}", activity_log_filepath)
   return {"delivery_id": None, "timestamp": 0}

def update_most_recently_processed(most_recently_processed_filepath, most_recently_processed_delivery, activity_log_filepath):
  detail = most_recently_processed_delivery[DETAILS_OBJECT_KEY]
  headers = detail.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_HEADERS, {})
  gitHubDeliveryId = headers.get(GITHUB_DELIVERY_HEADER)
  timestamp = most_recently_processed_delivery[TIMESTAMP_KEY]
  delivery_date = printable_date_time(detail, activity_log_filepath)
  delivery_date_str = delivery_date.isoformat() if delivery_date else None
  update_activity_log(f"Most recent processed delivery set to -- id: {gitHubDeliveryId}, date-time: {delivery_date_str}, timestamp: {timestamp}", activity_log_filepath)

  with open(most_recently_processed_filepath, "w") as f:
    json.dump({"delivery_id": gitHubDeliveryId, "delivery date-time": delivery_date_str, "timestamp": timestamp}, f, indent=4)

def delivery_needs_processing(most_recently_processed_timestamp, delivery, activity_log_filepath):
  details = delivery[DETAILS_OBJECT_KEY]
  headers = details.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_HEADERS, {})
  id = headers.get(GITHUB_DELIVERY_HEADER)
  timestamp = delivery[TIMESTAMP_KEY]

  if ignore_repository(details, activity_log_filepath) == True:
      update_activity_log(f"Ignoring delivery {id} based on repository ignore list", activity_log_filepath)
      return False
  
  try:
    most_recently_processed_timestamp = float(most_recently_processed_timestamp)
  except (TypeError, ValueError):
    update_activity_log(f"Invalid most_recently_processed_timestamp: {most_recently_processed_timestamp}, defaulting to 0.0", activity_log_filepath)
    most_recently_processed_timestamp = 0.0

  datetime_str = printable_date_time(details, activity_log_filepath)
  if timestamp > most_recently_processed_timestamp:
    update_activity_log(f"Delivery {id} ({datetime_str}) needs processing (timestamp: {timestamp} > most recent timestamp: {most_recently_processed_timestamp})", activity_log_filepath)
    return True

  update_activity_log(f"Delivery {id} ({datetime_str}) does not need processing (timestamp: {timestamp} <= most recent timestamp: {most_recently_processed_timestamp})", activity_log_filepath)
  return False

def get_ignored_repos(ignore_file='.repoIgnore'):
    if not hasattr(get_ignored_repos, "cache"):
        try:
            with open(ignore_file, "r") as f:
                get_ignored_repos.cache = set(line.strip() for line in f if line.strip())
        except FileNotFoundError:
            get_ignored_repos.cache = set()
    return get_ignored_repos.cache

def ignore_repository(delivery_detail, activity_log_filepath):
    requestPayload = delivery_detail.get(DELIVERY_DETAILS_REQUEST, {}).get(DELIVERY_DETAILS_PAYLOAD, {})
    repository = requestPayload.get("repository", {})
    repo_name = repository.get("name", "")
    ignored_repos = get_ignored_repos()
    if repo_name in ignored_repos:
      update_activity_log(f"Ignoring repository: {repo_name}", activity_log_filepath)
      return True
    else:
      return False

if __name__ == "__main__":
    main()
