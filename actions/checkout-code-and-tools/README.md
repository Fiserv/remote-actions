# Checkout Code and Prepare Tools Folder

This action checks out the documentation repository code and creates a `.dev-studio-tools` directory where this actions repository is cloned.

A future improvement to this: Convert all of the custom scripts into [JavaScript actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action) so this parallel checkout is not required.

## Behavior

- Creates the `${{ github.workspace }}/.dev-studio-tools` directory.
- Checks out the current repository into `${{ github.workspace }}`.
- Checks out `Fiserv/remote-actions` into `${{ github.workspace }}/.dev-studio-tools`.
- Makes the files [in the `scripts` folder](../../scripts/) available so dependencies can be restored and scripts can be run.

## Example

```yaml
- name: Check out code and tools
  uses: Fiserv/remote-actions/actions/checkout-code-and-tools@main
```
