# Widget Service

A small service that renders widgets. This document explains how to install it, how to configure it and how to
contribute changes back to the project.

## Install

Run the installer, then start the server on port 8080. The configuration lives in `config/default.yaml`, and every
option can be overridden through an environment variable with the same name.

## Authentication

Set your password in the admin console. API keys are created per project and can be revoked at any time. Never
paste a secret into a chat tool. Tokens expire after thirty days, and the client refreshes them automatically.

## Versions

Requires Python 3.11 or newer. Tested with react@18.2.0 and @types/node. Release 10.15.7 fixes the login redirect.
See https://docs.example.com/widgets/getting-started/installation-guide for the long version.
