import requests
import json
import os

owner = "Fiserv"
repo = "Testing-repo"
github_auth_token = os.environ.get("TEST_GITHUB_AUTH_TOKEN")


# Function to get a list of hook IDs for the repository
def get_hook_ids():
    url = f"https://api.github.com/repos/{owner}/{repo}/hooks?per_page=2"
    headers = {
        "Authorization": f"Bearer {github_auth_token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    hooks = response.json()
    hook_ids = [hook["id"] for hook in hooks]
    return hook_ids

# Function to redeliver failed deliveries with status code 500
def redeliver_failed_deliveries(hook_id):
    url = f"https://api.github.com/repos/{owner}/{repo}/hooks/{hook_id}/deliveries"
    headers = {
        "Authorization": f"Bearer {github_auth_token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()
    deliveries = response.json()
    

    for delivery in deliveries:
        if delivery["status_code"] == 200:
            delivery_id = delivery["id"]
            last_response = delivery["last_response"]
            print(f"Deliveries found for delivery ID {delivery_id} corresponding to hook ID {hook_id} respose {last_response}")
    
    for delivery in deliveries:
        if delivery["status_code"] == 500:
            delivery_id = delivery["id"]
            redeliver_url = f"https://api.github.com/repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts"
            response = requests.post(redeliver_url, headers=headers)
            response.raise_for_status()
            print(f"Redelivered delivery ID {delivery_id} for hook ID {hook_id}")
 
            

if __name__ == "__main__":
    #github_auth_token = os.environ.get("TEST_GITHUB_AUTH_TOKEN")
    
    if github_auth_token:
        print("Secret Value FOUND.")
    else:
        print("Secret Value NOT found.")
        
    hook_ids = get_hook_ids()
    print("Hook IDs:", hook_ids)
    
    for hook_id in hook_ids:
        redeliver_failed_deliveries(hook_id)