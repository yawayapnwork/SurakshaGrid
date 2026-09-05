#!/usr/bin/env python3
"""Generates the bcrypt hash to set as ADMIN_PASSWORD (Render/backend).

Run this locally — never in production, and never commit its output to git:

    python scripts/generate_admin_password_hash.py

It prompts for the officer password without echoing it to the terminal, then prints
only the resulting bcrypt hash. Paste that hash into ADMIN_PASSWORD on Render, and the
same plaintext password (the one you typed, not the hash) into ADMIN_PASSWORD_PLAIN on
Vercel — see README.md's Authentication section for why both exist.

A --password flag is also accepted for scripted/non-interactive use (e.g. a local
password manager pipeline), but prefer the interactive prompt: an argv value is
visible in your shell history and in `ps`/process listings on shared machines.
"""

import argparse
import getpass
import sys

# Ensure project root is importable when this script is executed directly.
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.security import get_password_hash  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a bcrypt hash for ADMIN_PASSWORD.")
    parser.add_argument(
        "--password",
        help="Password to hash (visible in shell history/process list — prefer the interactive prompt).",
    )
    args = parser.parse_args()

    password = args.password or getpass.getpass("Officer password to hash (input hidden): ")
    confirm = args.password or getpass.getpass("Confirm password: ")

    if password != confirm:
        print("Error: passwords did not match.", file=sys.stderr)
        sys.exit(1)

    if not password:
        print("Error: password must not be empty.", file=sys.stderr)
        sys.exit(1)

    print("\nADMIN_PASSWORD (set this on Render — never commit it):")
    print(get_password_hash(password))
    print(
        "\nRemember to also set the SAME plaintext password as ADMIN_PASSWORD_PLAIN on "
        "Vercel/the frontend — that variable holds the plaintext, this hash is for the "
        "backend only.",
    )


if __name__ == "__main__":
    main()
