import requests
import json
import os
import argparse


parser = argparse.ArgumentParser()
parser.add_argument(dest='repo', help="Tenant repo name")

tenant_repo = parser.parse_args().repo

github_auth_token = os.environ.get("TEST_GITHUB_AUTH_TOKEN")

# Function to get a list of hook IDs for the repository
def get_hook_ids():
    url = f"https://api.github.com/repos/{tenant_repo}/hooks?page=1&per_page=1"
    headers = {
        "Authorization": f"Bearer {github_auth_token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
     
    response = requests.get(url, headers=headers)
    #response.raise_for_status()
    hook_ids = []

    status = rresponse.status_code
    print ('response: ', status)

    if status == 200:
        hooks = response.json()
        hook_ids = [hook["id"] for hook in hooks]

    return hook_ids

# Function to redeliver failed deliveries
def redeliver_failed_deliveries(hook_id):
    url = f"https://api.github.com/repos/{tenant_repo}/hooks/{hook_id}/deliveries?per_page=1"
    headers = {
        "Authorization": f"Bearer {github_auth_token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    deliveries = response.json()
    
    for delivery in deliveries:
        if delivery["status_code"] >= 400:
            delivery_id = delivery["id"]
            redeliver_url = f"https://api.github.com/repos/{tenant_repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts"
            response = requests.post(redeliver_url, headers=headers)
            response.raise_for_status()
            print(f"Redelivered delivery ID {delivery_id} for hook ID {hook_id}")
 
            

if __name__ == "__main__": 
    
    print ('Retrying for the Tenant: ',tenant_repo)

    if github_auth_token:
        print("Secret Value FOUND.")
    else:
        print("Secret Value NOT found.")
        
    hook_ids = get_hook_ids()
 
    if hook_ids is not None:
        print("Hook IDs:", hook_ids)
    
    for hook_id in hook_ids:
        redeliver_failed_deliveries(hook_id)