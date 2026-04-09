 # Analyzing GitHub Webhooks

## Command-line parameters

`env`: The GitHub webhooks for this Developer Studio environment will be analyzed. Possible values:
- `dev`
- `qa`
- `stage`
- `prod`

## Analysis

- Retrieve all Webhook deliveries for the specified environment
- Ignore deliveries corresponding to a PR whose target branch does not match the branch corresponding to the specified environment
  - For example, if `env` is `dev`, only those webhooks whose PR target branch is `develop` will be analyzed
- Determine if webhook was blocked by the WAF
  - If the status code of the webhook response is `200`
    - Save the webhook delivery information to a file
      - Delivery Id
      - Timestamp
      - WAF info
        - transid
        - clientip
        - clientport
      - webhook request payload
- Determine if the webhook request timed out
  - If the webhook delivery does not contain a response
    - Save the webhook delivery information to a file
      - Delivery Id
      - Timestamp
      - webhook request payload
- Persist the files produced by the analysis process
  - Blocked webhooks
  - Timed out webhooks
  - Activity log
  - Metadata corresponding to the most recently processed webhook delivery
