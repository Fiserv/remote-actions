# Checkout Code and Prepare Tools Folder

This action checks out the documentation repository code and also creates a `.dev-studio-tools` folder where this actions repository will be cloned. This allows the files [in the `scripts` folder](../../scripts/) to have dependencies restored and run.

A future improvement to this would be to convert all of the custom scripts into [JavaScript actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action) so this parallel checkout is not required.
