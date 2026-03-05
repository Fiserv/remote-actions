# GitHub Content Validation Checks - Complete Reference

## Table of Contents

1. [API Access Validator](#1-api-access-validator)
2. [Config Validator](#2-config-validator)
3. [YAML/OpenAPI Spec Validator](#3-yamlopenapi-spec-validator)
4. [File Access Validator](#4-file-access-validator)
5. [Markdown Linter](#5-Markdown-Linter)
6. [Markdown Validator](#6-markdown-html-validator)
7. [Release Notes Validator](#7-release-notes-validator)
8. [Download API Zip Generator](#8-download-api-zip-generator)

---

## 1. API Access Validator

**File:** `scripts/api-access-validator.js`

**Target File:** `config/api-access-definition.yaml`

### Validation Checks

#### 1.1 Root Structure Validation

- ✅ Root element must be an array
- ✅ Array cannot be empty

#### 1.2 Entry-Level Validation

Each entry in the array must satisfy:

- ✅ **Entry must be an object** - Cannot be null or non-object type
- ✅ **Level field requirement** - Must have exactly ONE of:
  - `xChildProductName` (Level 0)
  - `xGroupName` (Level 1)
  - `xProxyName` (Level 2)
- ❌ Cannot have more than one level field defined (multiple `xProxyName`, etc.)
- ❌ Cannot have zero level fields defined (must at least have `xProxyName`)

#### 1.3 Field-Specific Validation

**xChildProductName (optional):**

- ✅ Must be a non-empty string
- ✅ Must be trimmed (no whitespace-only strings)
- ✅ Can only be used at top level (level 0)

**xGroupName (optional):**

- ✅ Must be a non-empty string
- ✅ Must be trimmed (no whitespace-only strings)
- ✅ Can only be defined at level 1

**xProxyName:**

- ✅ Must be a non-empty string
- ✅ Must be trimmed (no whitespace-only strings)
- ✅ Can only be defined at level 2

#### 1.4 Groups (optional) Array Validation

- ✅ `groups` field must exist
- ✅ `groups` must be an array
- ✅ Each group must be a non-empty string
- ✅ Group names can only contain: alphanumeric characters, underscores (\_), and hyphens (-)
- ❌ Invalid characters in group names will fail validation

#### 1.5 Versions Array Validation (Optional)

- ✅ Must be an array
- ✅ Each version must be a non-empty string

#### 1.6 Nested Sections (optional; only with api folder levels) Validation (Recursive)

- ✅ Must be an array
- ✅ Each section is validated recursively with the same rules
- ✅ Section must have one of: `xChildProductName`, `xGroupName`, or `xProxyName`
- ✅ Level constraints are enforced based on nesting depth

---

## 2. Config Validator

**File:** `scripts/config-validator.js`

**Target Files:**

- `config/document-explorer-definition.yaml`
- `config/recipe-explorer-definition.yaml` (optional)
- `config/product-layout.yaml`
- `config/tenant.json`

### Validation Checks

#### 2.1 Document/Recipe Explorer Definition Validation

**File Pattern:** `(document|recipe)-explorer-definition.yaml`

##### 2.1.1 Section Structure Validation

- ✅ Each section must have a `title` field
- ✅ If `link` is present without `title`, error is reported with line number
- ✅ Invalid section objects without title or link are flagged

##### 2.1.2 Link Validation

- ✅ Link must have non-zero length
- ✅ Link must match `.md` or `.mdx` file extension pattern
- ✅ For local links (not containing "branch"):
  - Link must exist in the repository filesystem
  - Missing files are reported with line number
- ✅ For branch-based links:
  - Validated against GitHub API
  - 404 errors reported if file missing from GitHub repo
  - Other HTTP errors are thrown as exceptions

##### 2.1.3 Recursive Validation

- ✅ Subsections are validated recursively with same rules

#### 2.2 Product Layout Validation

**File:** `config/product-layout.yaml`

- ✅ Must be valid YAML
- ✅ Cannot contain improper `<br>` tags (must use `<br />`)
- ✅ Cannot contain `<\ br>` or `<\br>` tags
- ❌ Regex patterns checked: `/(\<br\s*\>)/gi` and `/(\<\\\s?br\s*\>)/gi`

#### 2.3 Tenant Config (tenant.json) Validation

##### 2.3.1 JSON Structure

- ✅ Must be valid JSON

##### 2.3.2 Solution Field Validation

- ✅ For non-"Support" tenants, `solution` field must exist
- ✅ `solution` array must contain only valid solutions:
  - For fiserv-resources (internal tenant): `["fiserv-resources"]`
  - For others: `["merchants", "financial-institutions", "fintech", "carat"]`
- ❌ Invalid solutions in array will fail validation

##### 2.3.3 Product URL Validation

- ✅ Product URLs starting with `/v` must include the product name (such as `/v1/doctree/DeveloperStudioTest`)
- ✅ Ignored URLs: "developers", "merchants", "applications"
- ✅ Format check: `product.{urlKey}` should contain `data.name`

##### 2.3.4 Access Config Validation

- ✅ If `api-access-definition.yaml` exists, `product.accessConfig` must be defined
- ❌ Missing `accessConfig` when definition file exists will fail

##### 2.3.5 Getting Started Path Validation

- ✅ `getStartedFilePath` must exist
- ✅ Referenced file must exist in the docs directory
- ✅ Leading slash is handled automatically

##### 2.3.6 Resources Path Validation (Optional)

- ✅ Referenced file must exist in the docs directory

##### 2.3.7 Product Description Validation

- ✅ `product.description` must exist
- ✅ Description length must be between 1 and 112 characters
- ❌ Empty or too-long descriptions will fail

##### 2.3.8 API Versions Validation

- ✅ Each API version must have `version` and `versionType` fields
- ✅ `releaseNotesPath` must be non-empty and match `.md` or `.mdx` pattern
- ✅ Each `apiSpecFileNames` entry must exist in `reference/{version}/` directory
- ✅ Only ONE major version allowed
- ✅ Major version must be the highest version number
- ✅ Versions are sorted descendingly to verify major version

#### 2.4 Required Files Check

- ✅ Explorer definition file (document or recipe) must exist
- ✅ Product layout file must exist
- ✅ Tenant config file must exist
- ❌ Missing any required file will fail validation

---

## 3. YAML/OpenAPI Spec Validator

**File:** `scripts/validator-yaml.js`

**Target Files:** `reference/{version}/*.yaml` (OpenAPI specs)

### Validation Checks

#### 3.1 File Existence

- ✅ All spec files listed in `tenant.json` `apiSpecFileNames` must exist

#### 3.2 OpenAPI Version Validation

- ✅ `openapi` field must be defined
- ✅ Version must be between 3.0.0 and 3.0.3 (inclusive)
- ❌ Missing or out-of-range version fails validation

#### 3.3 Paths Validation

- ✅ `paths` object must exist
- ✅ `paths` must contain at least one entry
- ❌ Empty paths object fails validation

#### 3.4 Swagger/OpenAPI Schema Validation

- ✅ Full OpenAPI schema validation using `@apidevtools/swagger-parser`
- ✅ Schema must pass SwaggerParser.validate()

#### 3.5 API Endpoint Validation

For each path and method combination:

**x-proxy-name:**

- ✅ Must be present (required field)
- ✅ Must start with an alphabetical character (A-Z, a-z)
- ❌ Non-alphabetical first character fails validation

**x-group-name:**

- ✅ If present, must start with a word character (alphanumeric or underscore)
- ❌ Starting with non-word character fails validation

#### 3.6 Duplicate API Detection

- ✅ Checks for duplicate APIs using composite key: `{path}_{method}_{version}_{x-core}`
- ❌ Duplicate APIs across files will fail with reference to both files

#### 3.7 Markdown Conversion

- ✅ Description fields in request body and responses are converted to HTML
- ✅ Uses Showdown converter with GitHub-compatible settings

---

## 4. File Access Validator

**File:** `scripts/file-access-validator.js`

**Target Files:**

- `config/files-access-definition.yaml`
- `assets/files/*`

### Validation Checks

#### 4.1 File Path Validation

- ✅ `filePath` field must exist
- ✅ Referenced file must exist in `assets/files/` directory
- ✅ File must use supported file type extension
- ✅ **Supported file types:**
  - `doc`, `docx`
  - `gz`
  - `md`
  - `msi`
  - `pdf`
  - `png`
  - `ppt`, `pptx`
  - `txt`
  - `xls`, `xlsx`
  - `zip`
- ❌ Unsupported file types fail validation
- ❌ File names cannot contain spaces
- ❌ Missing files fail validation

#### 4.2 Access Level Validation

- ✅ `access` field must exist
- ✅ Access level must be one of: `"public"` or `"private"`
- ❌ Invalid or missing access level fails validation

#### 4.3 Groups Validation for Private Files

- ✅ Private files must have `groups` field defined
- ✅ Group names can only contain alphanumeric characters, underscores, and hyphens
- ❌ Improper group names (containing other special characters) fail validation
- ❌ Missing groups for private files fail validation

---

## 5. Markdown Linter

The following linter is for your markdown cleanliness purposes. It is not hard enforced as it generally has guidelines rather than breaking formatting issues.

**File:** `scripts/md-linter.js`

**Target Files:** `docs/**/*.md` and `docs/**/*.mdx`

### Validation Checks

Uses `markdownlint` library with custom configuration:

#### 5.1 Enabled Rules

- ✅ All default markdownlint rules EXCEPT the following disabled ones

#### 5.2 Disabled Rules

- ⚠️ `no-hard-tabs` - Hard tabs are allowed
- ⚠️ `whitespace` - Trailing whitespace allowed
- ⚠️ `line_length` - No line length limit
- ⚠️ `no-duplicate-heading` - Duplicate headings allowed
- ⚠️ `first-line-heading` - First line doesn't need to be heading
- ⚠️ `heading-style` - Heading style not enforced
- ⚠️ `no-inline-html` - Inline HTML allowed
- ⚠️ `no-bare-urls` - Bare URLs allowed

#### 5.3 File Format Validation

- ✅ Files must have `.md` or `.mdx` extension
- ❌ Invalid file extensions fail validation

#### 5.4 Directory Recursion

- ✅ Recursively processes all subdirectories

---

## 6. Markdown HTML Validator

**File:** `scripts/md-validator.js`

**Target Files:** `docs/**/*.md`, `docs/**/*.mdx`, `recipes/**/*.md`, `recipes/**/*.mdx`

### Validation Checks

#### 6.1 Link Validation

**GitHub Raw Links:**

- ❌ Raw GitHub links not allowed: `raw.githubusercontent.com`
- ❌ GitHub file links not allowed: `github.com/Fiserv/.../raw/...` or `.../files/...`
- ✅ Images should use `/assets/images` instead
- ✅ Files should use `/assets` instead

**Local Asset Links:**

- ✅ Links matching `localhost:8080/api/(hosted-image|download)/` are validated
- ✅ Referenced asset files must exist in the repository
- ❌ Missing asset files fail validation

#### 6.2 Image URL Extraction

- ✅ All image `src` attributes are extracted and validated
- ✅ Uses regex: `/<img.*?src=["'](.*?)["']/g`

#### 6.3 HTML Tag Validation

**BR Tag Validation:**

- ❌ `<br>` must be self-closing: `<br />`
- ❌ Improper formats flagged: `/(\<br\s*\>)/gi`
- ❌ Backslash variations flagged: `/(\<\\\s?br\s*\>)/gi`
- ✅ Reports line number and count of violations

**Double Curly Braces:**

- ❌ `{{` must be escaped as `\{\{`
- ✅ Reports line number of violations

**Unclosed HTML Tags:**

- ✅ Detects opening tags without corresponding closing tags
- ✅ Ignores tags within quotes (single, double, or backticks)
- ✅ Excludes `<br>` tags from this check
- ❌ Unclosed tags must either:
  - Be escaped: `\<tagname>`
  - Have closing tag: `</tagname>`
- ✅ Reports tag name and line number

#### 6.4 Directory Structure

- ✅ Recursively processes `docs/` and `recipes/` directories
- ❌ Invalid subdirectories or non-markdown files are flagged
- ✅ `config.yaml` files are ignored (allowed in docs)

#### 6.5 Markdown compilation

- ✅ Checks using `@mdx-js/mdx : compile` to ensure that your MD and MDX files can pass basic compilation

---

## 7. Release Notes Validator

**File:** `scripts/release-notes-validator.js`

**Target Directory:** `docs/**/release*note*/`

### Validation Checks

#### 7.1 Directory Existence

- ✅ Must have a directory matching pattern: `/release.*note/i`
- ❌ Missing release notes directory fails validation

#### 7.2 Content Validation

- ✅ Release notes directory must contain at least one markdown file
- ✅ Searches recursively through subdirectories
- ✅ Valid markdown extensions: `.md` or `.mdx`
- ❌ Empty release notes directory fails validation

---

## 8. Download API Zip Generator

**File:** `scripts/download-api-zip.js`

**Target Files:** `reference/{version}/*.yaml`

**Output:**

- `assets/{tenant}_spec.zip`
- `assets/{tenant}_postman.zip`

### Validation & Generation Checks

#### 8.1 OpenAPI Spec Validation

- ✅ All checks from YAML Validator (Section 3) apply
- ✅ Spec files must exist
- ✅ Must be valid YAML
- ✅ Must pass SwaggerParser validation
- ✅ `paths` object must exist and be non-empty
- ✅ Each API must have `x-proxy-name`

#### 8.2 Spec Zip Generation

- ✅ Adds valid spec files to `{tenant}_spec.zip`
- ✅ Maintains directory structure: `{repo}/{path}/{filename}`
- ✅ Handles both reference and references folders
- ✅ Writes zip to `assets/` directory

#### 8.3 Postman Collection Generation

- ✅ Converts OpenAPI specs to Postman collections using `openapi-to-postmanv2`
- ✅ Times out after 5 seconds per conversion
- ✅ Adds generated collections to `{tenant}_postman.zip`
- ✅ JSON format with .json extension
- ✅ Maintains same directory structure as spec files
- ⚠️ Warnings for failed conversions (doesn't fail overall validation)

---

## Summary Table

| Validator         | Target Files                                        | Key Validations                      | Critical Checks                                            |
| ----------------- | --------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| **API Access**    | `api-access-definition.yaml`                        | Structure, levels, groups            | Exactly one level per entry, valid group names             |
| **Config**        | `tenant.json`, explorer definitions, product layout | Solutions, paths, versions           | File existence, API versions, major version uniqueness     |
| **YAML/OpenAPI**  | `reference/**/*.yaml`                               | OpenAPI schema, x-fields, duplicates | Version 3.0.x, x-proxy-name required, no duplicates        |
| **File Access**   | `files-access-definition.yaml`                      | File types, access levels, groups    | Supported extensions, no spaces, private files need groups |
| **MD Linter**     | `docs/**/*.md(x)`                                   | Markdown syntax                      | Default markdownlint rules (with exceptions)               |
| **MD HTML**       | `docs/**/*.md(x)`                                   | Links, images, HTML tags             | No GitHub raw links, closed tags, escaped special chars    |
| **Release Notes** | `docs/**/release*note*/`                            | Directory and content                | Must exist with at least one markdown file                 |
| **ZIP Generator** | `reference/**/*.yaml`                               | Spec validity, Postman conversion    | All OpenAPI checks, successful zip creation                |

---

## Error Severity Levels

### 🔴 Critical Errors (Validation Fails)

- Missing required files
- Invalid JSON/YAML syntax
- Schema validation failures
- Broken links to local files
- Missing required fields
- Invalid field values
- Improper HTML tags in markdown
- Duplicate API definitions

### 🟡 Warnings (Logged but May Pass)

- Postman conversion failures
- GitHub API fetch errors (non-404)
- Missing optional fields

### ✅ Info/Pass Messages

- Successful validations
- Skipped validations (file not found scenarios)

---

_Last Updated: February 12, 2026_
