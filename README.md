# Sointu

## Introduction

Sointu is an exercise grading and returning system. It's goal is to make it possible to test code snippets in the browser, with real time status reporting.

Sointu works by embedding a source code editor widget in the browser, with a "Submit" button. Clicking the submit button sends the user's written code to a dedicated back-end, which then runs the code in a Docker container. The user is shown the results of the submitted code immediatelly, after it has been evaluated.

Sointu supports creating exercise templates and tests, whose results can be sent back into the user's browser.

## Supported runtimes

Currently, Sointu supports the following runtimes:

- Deno 1.0.0
- Python 3.6

As a security measure, Sointu containers cannot access network or storage inside the container. STDOUT is the only output supported.

Each Sointu instance has 64M of memory and 0.25vCPU, and each user is limited one running instance at a time.

## License

MIT license
