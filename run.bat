@echo off
REM Windows launcher: creates a virtual environment, installs packages, starts the app.
if not exist venv python -m venv venv
call venv\Scripts\activate
python -m pip install -r requirements.txt
python -m streamlit run app.py
