import sys
import requests
import os
import json
import re

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
    for delivery in deliveries:
         statusCode = delivery.get("status_code")
         if statusCode == 200:
              num_blocked += 1

              # Retrieve the delivery details and gather relevant information
              delivery_id = delivery["id"]
              detail_url = f"{deliveries_url}/{delivery_id}"
              detail = requests.get(detail_url, headers=HEADERS).json()
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

if __name__ == "__main__":
    main()
