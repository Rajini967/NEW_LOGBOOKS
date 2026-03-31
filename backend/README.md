# Backend workflow

## Setup

- Create virtual environment and activate it.
- Install dependencies:
  - `pip install -r requirements.txt`
- Configure environment variables (`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, DB and Celery settings).

## Run locally

- Apply migrations: `python manage.py migrate`
- Start API: `python manage.py runserver`
- Start Celery worker: `celery -A core worker -l info`

## Quality checks

- Run backend tests:
  - `python manage.py test`
- Run targeted tests:
  - `python manage.py test chiller_logs.tests boiler_logs.tests`

## Notes

- `ENVIRONMENT=production` requires `SECRET_KEY` and `ALLOWED_HOSTS` to be explicitly configured.
- `DEBUG` defaults to `True` only for non-production environments.
