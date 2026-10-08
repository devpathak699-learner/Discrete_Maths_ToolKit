#!/usr/bin/env bash
# macOS / Linux launcher: creates a virtual environment, installs packages, starts the app.
[ -d venv ] || python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
python -m streamlit run app.py
