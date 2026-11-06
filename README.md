# DS Auto Cleaning

Redesign of the website for DS Auto Cleaning, a car detailing business in Surčin, Serbia.

## Features

- Responsive pages: home, before/after sliders, gallery with a full-screen viewer
- Price list with a vehicle-size switch and service descriptions in popups
- Online booking form with a calendar and time slots; requests are sent over WhatsApp
- Admin page where the owner marks days and times as busy
- Bookings open through the end of next month

## Tech

HTML, CSS and JavaScript with no framework. The backend (`server.py`) uses only the Python standard library and SQLite.

## Run locally

Requires Python 3.9+.

```bash
python3 server.py
```

The site runs at http://localhost:8765 and the admin page at `/admin.html`.

Create an admin account:

```bash
python3 server.py create-admin <username>
```

The database is created in `data/`, which is not part of this repository.

In production, serve the site over HTTPS and set `COOKIE_SECURE=1`.
