# P2P Bike Rental — Project Documentation

A peer-to-peer bike rental platform where users can list their bikes for rent and renters can browse, book, and pay for bikes. Payments are handled via Razorpay with a marketplace split — the platform takes a 15% fee and the remaining 85% is transferred to bike owners through Razorpay Route linked accounts.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Environment Variables](#environment-variables)
4. [Database Schema](#database-schema)
5. [Getting Started](#getting-started)
6. [Authentication](#authentication)
7. [API Reference](#api-reference)
8. [Frontend Pages](#frontend-pages)
9. [Payment Flow](#payment-flow)
10. [Booking Lifecycle](#booking-lifecycle)
11. [Admin System](#admin-system)
12. [Key Business Logic](#key-business-logic)

---

## Tech Stack

### Backend
| Package | Version | Purpose |
|---|---|---|
| Node.js + Express | ^4.18.2 | HTTP server |
| PostgreSQL + pg | ^8.16.2 | Database |
| bcryptjs | ^3.0.2 | Password hashing |
| jsonwebtoken | ^9.0.2 | JWT authentication |
| express-validator | ^7.2.1 | Input validation |
| axios | ^1.10.0 | Razorpay API calls |
| dotenv | ^16.5.0 | Environment config |
| cors | ^2.8.5 | Cross-origin requests |
| multer | ^2.0.1 | File upload support |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| React | ^19.1.0 | UI framework |
| react-router-dom | ^7.6.2 | Client-side routing |
| axios | ^1.10.0 | API calls |
| react-toastify | ^11.0.5 | Toast notifications |
| leaflet + react-leaflet | ^1.9.4 / ^5.0.0 | Interactive maps for bike location |
| react-scripts | 5.0.1 | CRA build tooling |

### External Services
- **Razorpay** — Payments, Route marketplace transfers, refunds
- **OpenStreetMap** — Map tiles via Leaflet (no API key required)

---

## Project Structure

```
p2p-bike-rental/
├── bike_rental_db_schema.sql          # Base PostgreSQL schema
├── client/                            # React frontend (CRA)
│   ├── public/
│   ├── package.json                   # proxy: http://localhost:5050
│   └── src/
│       ├── App.js                     # Route definitions
│       ├── contexts/
│       │   └── AuthContext.js         # Global auth state
│       ├── components/
│       │   └── Navbar.js              # Navigation bar
│       └── pages/
│           ├── Home.js
│           ├── Login.js
│           ├── Register.js
│           ├── BikeList.js
│           ├── BikeDetail.js
│           ├── AddBike.js
│           ├── EditBike.js
│           ├── MyBikes.js
│           ├── MyBookings.js
│           ├── OwnerBookings.js
│           ├── Messages.js
│           ├── Payments.js
│           ├── Profile.js
│           ├── AdminDashboard.js
│           └── NotFound.js
└── server/                            # Express backend
    ├── server.js                      # Entry point
    ├── db.js                          # pg Pool
    ├── package.json
    ├── .env
    ├── middleware/
    │   ├── auth.js                    # JWT verification
    │   └── admin.js                   # Admin email check
    ├── utils/
    │   └── admin.js                   # isAdminEmail() helper
    ├── services/
    │   ├── razorpay.js                # All Razorpay API calls
    │   ├── bookingPricing.js          # Price + fee calculation
    │   └── audit.js                   # Booking event logging
    ├── routes/
    │   ├── auth.js
    │   ├── bikes.js
    │   ├── bookings.js
    │   ├── payments.js
    │   ├── users.js
    │   ├── reviews.js
    │   ├── messages.js
    │   ├── owners.js
    │   ├── admin.js
    │   └── webhooks.js
    └── migrations/
        └── 002_razorpay_marketplace.sql
```

---

## Environment Variables

Create `server/.env` with the following:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_db_password
DB_NAME=bike_rental_db

# Authentication
JWT_SECRET=your_jwt_secret_here          # ⚠️ Change in production — defaults to 'your-secret-key'

# Admin access (comma-separated emails)
ADMIN_EMAILS=admin@example.com

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_API_BASE=https://api.razorpay.com/v1   # optional override

# Platform fee (default 15%)
PLATFORM_FEE_RATE=0.15
```

> **⚠️ Warning**: `JWT_SECRET` is not required in `.env` and falls back to a hardcoded default. Always set it explicitly in production.

---

## Database Schema

Run the base schema first, then the migration:

```bash
psql -U postgres -d bike_rental_db -f bike_rental_db_schema.sql
psql -U postgres -d bike_rental_db -f server/migrations/002_razorpay_marketplace.sql
```

### Core Tables

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(100) | NOT NULL, UNIQUE |
| password | VARCHAR(255) | bcrypt hash |
| phone | VARCHAR(20) | optional |
| address | TEXT | optional |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Admin status is **not stored in the DB** — it is computed from the `ADMIN_EMAILS` environment variable.

#### `bikes`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| owner_id | FK → users | ON DELETE CASCADE |
| title | VARCHAR(100) | NOT NULL |
| description | TEXT | NOT NULL |
| brand | VARCHAR(50) | |
| model | VARCHAR(50) | |
| year | INTEGER | |
| price_per_day | NUMERIC(10,2) | NOT NULL |
| location | VARCHAR(100) | NOT NULL |
| latitude | NUMERIC(9,6) | for map pin |
| longitude | NUMERIC(9,6) | for map pin |
| image_url | TEXT | base64 JPEG or URL |
| available | BOOLEAN | DEFAULT true |
| created_at / updated_at | TIMESTAMP | |

#### `bookings`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| bike_id | FK → bikes | ON DELETE CASCADE |
| renter_id | FK → users | |
| owner_id | FK → users | |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| total_price | NUMERIC(10,2) | calculated at booking time |
| status | VARCHAR(20) | booking workflow state |
| booking_status | VARCHAR(40) | mirrors status, extended values |
| payment_status | VARCHAR(40) | created / captured / failed / refunded |
| payout_status | VARCHAR(40) | not_ready / awaiting_admin_release / transferred |
| platform_fee | NUMERIC(10,2) | 15% of total_price |
| owner_amount | NUMERIC(10,2) | 85% of total_price |
| refund_amount | NUMERIC(10,2) | set when refund initiated |
| cancelled_at | TIMESTAMP | |
| trip_completed_at | TIMESTAMP | |
| created_at / updated_at | TIMESTAMP | |

**Valid booking statuses**: `pending`, `pending_payment`, `paid_pending_confirmation`, `confirmed`, `in_progress`, `completed`, `cancelled`, `refund_initiated`, `refunded`

#### `payments`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| booking_id | FK → bookings | ON DELETE CASCADE |
| payer_id | FK → users | |
| amount | NUMERIC(10,2) | NOT NULL |
| currency | VARCHAR(10) | DEFAULT 'INR' |
| payment_method | VARCHAR(50) | 'razorpay' |
| status | VARCHAR(20) | pending / created / captured / completed / failed / refunded |
| transaction_id | VARCHAR(100) | internal ORDER-{timestamp} ref |
| razorpay_order_id | VARCHAR(100) | Razorpay order ID |
| razorpay_payment_id | VARCHAR(100) | Razorpay payment ID after capture |
| razorpay_signature | VARCHAR(255) | for verification |
| verified | BOOLEAN | DEFAULT false |
| gateway_payload | JSONB | full Razorpay response |
| created_at / updated_at | TIMESTAMP | |

#### `messages`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| sender_id | FK → users | ON DELETE CASCADE |
| receiver_id | FK → users | ON DELETE CASCADE |
| content | TEXT | NOT NULL |
| sent_at | TIMESTAMP | |
| read | BOOLEAN | DEFAULT false |

#### `reviews`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| bike_id | FK → bikes | ON DELETE CASCADE |
| reviewer_id | FK → users | |
| rating | INTEGER | CHECK 1–5 |
| comment | TEXT | optional |
| created_at | TIMESTAMP | |

### Migration Tables (`002_razorpay_marketplace.sql`)

#### `owner_linked_accounts`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| owner_id | FK → users | UNIQUE — one per owner |
| razorpay_account_id | VARCHAR(100) | Razorpay Route account ID |
| onboarding_status | VARCHAR(40) | created / activated |
| kyc_status | VARCHAR(40) | pending / completed |
| beneficiary_status | VARCHAR(40) | pending / activated |
| last_synced_at | TIMESTAMP | last Razorpay API sync |
| created_at / updated_at | TIMESTAMP | |

#### `payouts`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| booking_id | FK → bookings | |
| owner_id | FK → users | |
| linked_account_id | FK → owner_linked_accounts | |
| transfer_amount | NUMERIC(10,2) | 85% of total |
| platform_commission | NUMERIC(10,2) | 15% kept |
| razorpay_transfer_id | VARCHAR(100) | Razorpay transfer ID |
| transfer_status | VARCHAR(40) | created / transferred |
| released_by_admin_id | FK → users | admin who released |
| released_at | TIMESTAMP | |
| created_at / updated_at | TIMESTAMP | |

#### `refunds`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| booking_id | FK → bookings | |
| payment_id | FK → payments | |
| refund_amount | NUMERIC(10,2) | 50% of total_price |
| razorpay_refund_id | VARCHAR(100) | |
| reason | TEXT | '50% cancellation refund' |
| status | VARCHAR(40) | created / processed |
| gateway_payload | JSONB | full Razorpay response |
| created_at / updated_at | TIMESTAMP | |

#### `booking_audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| booking_id | FK → bookings | |
| event_type | VARCHAR(100) | e.g. 'booking_created', 'payment_verified' |
| metadata | JSONB | context data per event |
| created_at | TIMESTAMP | |

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Razorpay account (test mode is fine)

### Setup

```bash
# 1. Clone and install server dependencies
cd server
npm install

# 2. Create and seed the database
createdb bike_rental_db
psql -U postgres -d bike_rental_db -f ../bike_rental_db_schema.sql
psql -U postgres -d bike_rental_db -f migrations/002_razorpay_marketplace.sql

# 3. Configure environment
cp .env.example .env   # then fill in your values

# 4. Start server (port 5050)
npm start

# 5. In a separate terminal, install and start client
cd ../client
npm install
npm start              # starts on port 3000, proxies /api/* to :5050
```

### Scripts
| Command | Description |
|---|---|
| `cd server && npm start` | Start Express API on port 5050 |
| `cd client && npm start` | Start React dev server on port 3000 |
| `cd client && npm run build` | Production build |

---

## Authentication

### How it works

1. Register (`POST /api/auth/register`) or Login (`POST /api/auth/login`) returns a signed JWT (7-day expiry)
2. JWT is stored in `localStorage` and attached to all subsequent requests as `Authorization: Bearer <token>`
3. On app load, `AuthContext` reads the token, sets it on axios defaults, and fetches `/api/users/profile` to hydrate user state
4. Protected frontend routes redirect to `/login` if no user is present
5. Server middleware (`auth.js`) verifies the JWT and sets `req.userId` on all protected endpoints

### Admin access

Admin is **email-based** — no role column in the database. Set `ADMIN_EMAILS` in `.env`:

```env
ADMIN_EMAILS=admin@yourdomain.com,superadmin@yourdomain.com
```

The `isAdmin` flag is returned with the user profile and gates access to the admin dashboard and all `/api/admin/*` endpoints.

---

## API Reference

Base URL: `http://localhost:5050`  
All protected endpoints require: `Authorization: Bearer <token>`

---

### Auth — `/api/auth`

#### `POST /api/auth/register`
Create a new account.

**Body**
```json
{
  "name": "Vishal Kumar",
  "email": "vishal@example.com",
  "password": "password123",
  "phone": "9876543210",
  "address": "Pune, Maharashtra"
}
```

**Response `201`**
```json
{
  "message": "User registered successfully",
  "token": "<jwt>",
  "user": { "id": 1, "name": "Vishal Kumar", "email": "...", "isAdmin": false }
}
```

#### `POST /api/auth/login`
**Body**: `{ "email", "password" }`  
**Response `200`**: Same shape as register.

---

### Bikes — `/api/bikes`

#### `GET /api/bikes`
List bikes with optional filters.

**Query params**
| Param | Type | Description |
|---|---|---|
| search | string | ILIKE match on title, brand, model |
| location | string | ILIKE match on location |
| minPrice | number | Min price per day |
| maxPrice | number | Max price per day |
| available | boolean | `true` or `false` |

**Response `200`**: Array of bike objects with `owner_name`, `owner_phone`.

#### `GET /api/bikes/:id`
Single bike with `owner_name`, `owner_phone`, `owner_email`.

#### `POST /api/bikes` 🔒
Create a bike listing. Image should be a base64-encoded JPEG string.

**Body**
```json
{
  "title": "Trek Marlin 7",
  "description": "Great mountain bike in excellent condition",
  "brand": "Trek",
  "model": "Marlin 7",
  "year": 2022,
  "price_per_day": 500,
  "location": "Pune",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "image_url": "data:image/jpeg;base64,..."
}
```

#### `PUT /api/bikes/:id` 🔒
Update bike. Same body as POST plus `"available": true/false`. Owner-only.

#### `DELETE /api/bikes/:id` 🔒
Delete bike. Owner-only.

---

### Bookings — `/api/bookings`

#### `GET /api/bookings/my-bookings` 🔒
All bookings made by the current user (renter view). Includes bike details and latest payment status.

#### `GET /api/bookings/bike-bookings` 🔒
All bookings on the current user's bikes (owner view). Includes renter contact info.

#### `GET /api/bookings/:id` 🔒
Single booking with full details. Only the renter or owner can access it.

#### `POST /api/bookings` 🔒
Create a booking.

**Body**
```json
{
  "bike_id": 5,
  "start_date": "2025-09-01",
  "end_date": "2025-09-05"
}
```

Business rules enforced:
- Bike must be available
- Cannot book your own bike
- Date conflicts rejected (checks against active booking states)
- Pricing calculated automatically

**Response `201`**
```json
{
  "message": "Booking created successfully. Complete payment to continue.",
  "booking": { "id": 12, "total_price": "2500.00", "status": "pending_payment", ... }
}
```

#### `POST /api/bookings/:bookingId/payment-order` 🔒
Create a Razorpay order for payment. Called right before opening the Razorpay checkout.

**Response `200`**
```json
{
  "key": "rzp_test_xxxx",
  "order": { "id": "order_xxxx", "amount": 250000, "currency": "INR", ... },
  "payment": { "id": 8, "razorpay_order_id": "order_xxxx", ... },
  "booking": { "id": 12, "total_price": "2500.00", "bike_title": "Trek Marlin 7" }
}
```

#### `POST /api/bookings/:bookingId/cancel` 🔒
Cancel a booking. Accessible by renter or owner. Blocked if payout already transferred.

#### `PUT /api/bookings/:id/status` 🔒
Update booking status. Accessible by renter or owner.

**Body**: `{ "status": "confirmed" }`  
Valid statuses: `pending_payment`, `paid_pending_confirmation`, `confirmed`, `in_progress`, `completed`, `cancelled`, `refund_initiated`, `refunded`

---

### Payments — `/api/payments`

#### `GET /api/payments/my-payments` 🔒
All payments made by current user, with bike and booking details.

#### `GET /api/payments/booking/:bookingId` 🔒
Latest payment record for a specific booking.

#### `POST /api/payments/verify` 🔒
Verify a Razorpay payment after checkout completes. Validates signature, fetches payment from Razorpay API, marks payment `captured`, moves booking to `paid_pending_confirmation`.

**Body**
```json
{
  "booking_id": 12,
  "razorpay_order_id": "order_xxxx",
  "razorpay_payment_id": "pay_xxxx",
  "razorpay_signature": "abc123..."
}
```

#### `POST /api/payments/refund/:bookingId` 🔒
Initiate a 50% cancellation refund via Razorpay. Creates entry in `refunds` table.

---

### Users — `/api/users`

#### `GET /api/users/profile` 🔒
Current user's profile with `isAdmin` flag.

#### `PUT /api/users/profile` 🔒
Update name, phone, address.  
**Body**: `{ "name", "phone", "address" }`

#### `GET /api/users/my-bikes` 🔒
All bikes listed by the current user.

#### `GET /api/users/:id` 🔒
Public profile (id, name, email, phone) for any user — used for messaging context.

---

### Reviews — `/api/reviews`

#### `GET /api/reviews/bike/:bikeId`
All reviews for a bike plus aggregate summary.

**Response `200`**
```json
{
  "reviews": [{ "id": 1, "rating": 5, "comment": "...", "reviewer_name": "..." }],
  "summary": { "average_rating": "4.5", "review_count": 12 }
}
```

#### `POST /api/reviews/bike/:bikeId` 🔒
Create or update a review (one per user per bike — upsert).

**Eligibility**: Must have a `confirmed` or `completed` booking for this bike. Cannot review own bike.

**Body**: `{ "rating": 5, "comment": "Excellent condition!" }`

---

### Messages — `/api/messages`

#### `GET /api/messages/conversations` 🔒
All conversations with latest message preview and unread count per conversation.

#### `GET /api/messages/:userId` 🔒
Full message thread with a specific user.

**Response**
```json
{
  "otherUser": { "id": 3, "name": "...", "email": "..." },
  "messages": [{ "id": 1, "content": "...", "sender_id": 1, "sent_at": "..." }]
}
```

#### `POST /api/messages` 🔒
Send a message.  
**Body**: `{ "receiver_id": 3, "content": "Is the bike still available?" }`

#### `PUT /api/messages/:userId/read` 🔒
Mark all messages from `userId` to the current user as read.

---

### Owners — `/api/owners`

#### `POST /api/owners/route-account` 🔒
Register a Razorpay Route linked account for owner payouts. Upserts into `owner_linked_accounts`.

**Body**
```json
{
  "legal_business_name": "Vishal Rentals",
  "business_type": "individual",
  "contact_name": "Vishal Kumar",
  "phone": "9876543210",
  "email": "vishal@example.com",
  "street1": "123 MG Road",
  "city": "Pune",
  "state": "Maharashtra",
  "postal_code": "411001"
}
```

#### `GET /api/owners/route-account/status` 🔒
Fetch local account status and sync with Razorpay API. Returns `null` if no account registered.

---

### Admin — `/api/admin` 🔒🛡️

All endpoints require JWT + admin email.

#### `GET /api/admin/dashboard`
KPI stats and chart data.

**Response**
```json
{
  "stats": {
    "total_users": 45,
    "total_bikes": 120,
    "total_bookings": 300,
    "pending_bookings": 12,
    "confirmed_bookings": 8,
    "completed_bookings": 260,
    "cancelled_bookings": 20,
    "total_payments": 255,
    "total_revenue": "382500.00",
    "total_reviews": 180,
    "average_rating": "4.3",
    "total_messages": 540,
    "unread_messages": 23
  },
  "charts": {
    "revenueByMonth": [{ "label": "Jan 2025", "value": "75000.00" }],
    "bookingsByMonth": [{ "label": "Jan 2025", "value": 45 }],
    "bookingStatus": [{ "label": "Pending", "value": 12 }, ...]
  }
}
```

#### List Endpoints
All return `{ items[], page, pageSize, total, totalPages }` with page size 10.

| Endpoint | Search fields |
|---|---|
| `GET /api/admin/bookings?page&search&status` | bike title, owner name, renter name |
| `GET /api/admin/users?page&search` | name, email, phone |
| `GET /api/admin/bikes?page&search` | title, location, owner name |
| `GET /api/admin/reviews?page&search` | bike title, reviewer name, comment |
| `GET /api/admin/payments?page&search` | bike title, payer name, transaction ID |
| `GET /api/admin/messages?page&search` | sender name, receiver name, content |

#### Action Endpoints
| Method | Path | Description |
|---|---|---|
| PUT | `/bookings/:id/status` | Force-set booking status |
| POST | `/bookings/:id/approve` | Approve paid booking (requires captured payment) |
| POST | `/bookings/:id/release-payout` | Transfer owner amount via Razorpay Route |
| PUT | `/payments/:id/status` | Update payment status |
| DELETE | `/payments/:id` | Hard delete payment |
| PUT | `/messages/:id/read` | Toggle message read state |
| DELETE | `/messages/:id` | Hard delete message |
| DELETE | `/users/:id` | Hard delete user |
| DELETE | `/bikes/:id` | Hard delete bike |
| DELETE | `/reviews/:id` | Hard delete review |
| GET | `/export/:resource` | CSV export (bookings/users/bikes/reviews/payments/messages) |
| GET | `/audit-logs/:bookingId` | Full audit trail for a booking |

---

### Webhooks — `/api/webhooks`

#### `POST /api/webhooks/razorpay`
Receives Razorpay webhook events. Signature verified via HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`.

Handled events:
| Event | Action |
|---|---|
| `payment.captured` | Update payment to `captured`, booking to `paid_pending_confirmation` |
| `payment.failed` | Update payment to `failed`, booking back to `pending_payment` |
| `refund.processed` | Update refund to `processed`, booking to `refunded` |

> Raw body parsing (`express.raw`) is applied **only** to this route to allow signature verification.

---

## Frontend Pages

### Route Map

| Path | Component | Access |
|---|---|---|
| `/` | Home | Public |
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/bikes` | BikeList | Public |
| `/bikes/:id` | BikeDetail | Public |
| `/add-bike` | AddBike | Auth required |
| `/my-bikes` | MyBikes | Auth required |
| `/edit-bike/:id` | EditBike | Auth required |
| `/my-bookings` | MyBookings | Auth required |
| `/owner-bookings` | OwnerBookings | Auth required |
| `/messages` | Messages | Auth required |
| `/payments` | Payments | Auth required |
| `/profile` | Profile | Auth required |
| `/admin` | AdminDashboard | Admin only |
| `*` | NotFound | Public |

### Page Descriptions

**Home** — Hero section, 4 feature cards, 3 featured bikes, 3-step how-it-works.

**BikeList** — Reactive search/filter grid. Filters: text search (title/brand/model), location, min/max price, availability. Results update on every filter change.

**BikeDetail** — Full bike info with owner contact. Book Now button opens a date picker modal. Review form for eligible renters. Displays all existing reviews with ratings.

**AddBike / EditBike** — Form with Leaflet map for location picking. Images are resized client-side (max 1400px, JPEG 80%) and stored as base64. Edit page also has an availability toggle.

**MyBikes** — Owner's listings with View / Edit / Delete actions.

**MyBookings** — Renter's bookings. Shows payment status and payout status. Inline Razorpay checkout for pending payments. Cancel with optional 50% refund trigger.

**OwnerBookings** — Bookings on owner's bikes. Actions: Confirm, Cancel, Mark Complete. Message renter button.

**Messages** — Split-pane chat UI. Left panel: conversation list with unread badges. Right panel: message thread with send form. URL param `?user=<id>` drives active conversation.

**Payments** — Payment history with Razorpay order IDs, payment IDs, method, status, timestamp.

**Profile** — Edit name/phone/address. Owner payout onboarding form (Razorpay Route linked account). Shows current KYC and beneficiary status.

**AdminDashboard** — KPI stat cards, 3 bar charts. Tabbed management (bookings, users, bikes, reviews, payments, messages). Search, filter, paginate. Per-record actions. CSV export.

**NotFound** — 404 page with navigation links.

---

## Payment Flow

```
Renter books bike
      │
      ▼
POST /api/bookings
→ booking.status = 'pending_payment'
→ booking.payment_status = 'created'
      │
      ▼
Renter clicks "Pay with Razorpay"
      │
      ▼
POST /api/bookings/:id/payment-order
→ Razorpay order created
→ payments row inserted (status: 'created')
→ returns { key, order }
      │
      ▼
Frontend opens Razorpay checkout modal
      │
      ▼
Renter completes payment
      │
      ┌─────────────────────┐
      │                     │
   Webhook              Frontend handler
POST /api/webhooks/razorpay  POST /api/payments/verify
      │                     │
      └─────────┬───────────┘
                ▼
payment.status = 'captured'
booking.payment_status = 'captured'
booking.status = 'paid_pending_confirmation'
                │
                ▼
         Admin reviews booking
                │
                ▼
POST /api/admin/bookings/:id/approve
booking.status = 'confirmed'
booking.payout_status = 'awaiting_admin_release'
                │
                ▼
    [Rental period completes]
                │
                ▼
POST /api/admin/bookings/:id/status { status: 'completed' }
                │
                ▼
POST /api/admin/bookings/:id/release-payout
→ Razorpay transfer to owner's linked account
→ payouts row inserted
→ booking.payout_status = 'transferred'
```

### Cancellation & Refund Flow

```
Renter cancels booking
      │
POST /api/bookings/:id/cancel
      │
      ├── payment was NOT captured
      │   └── booking.status = 'cancelled'
      │
      └── payment WAS captured
          └── booking.status = 'cancelled'
              booking.booking_status = 'refund_initiated'
                    │
                    ▼
          POST /api/payments/refund/:bookingId
          → 50% refund via Razorpay
          → refunds row inserted
          → booking.payment_status = 'refunded'
```

---

## Booking Lifecycle

```
pending_payment
    │
    │  (Razorpay payment captured)
    ▼
paid_pending_confirmation
    │
    │  (Admin approves)
    ▼
confirmed
    │
    │  (Admin / owner marks in progress)
    ▼
in_progress
    │
    │  (Admin / owner marks complete)
    ▼
completed ──────────────────► (Admin releases payout)
                               payout_status: transferred

    At any non-completed/transferred stage:
    ├── cancelled (no payment) → status: cancelled
    └── cancelled (with payment) → refund_initiated → refunded
```

**Active states** (block date conflicts): `pending`, `pending_payment`, `paid_pending_confirmation`, `confirmed`, `in_progress`

---

## Admin System

### Access Control

Admin access is email-based. Set in `.env`:
```env
ADMIN_EMAILS=vishal@example.com,admin@example.com
```

Every admin API request passes through two middlewares in sequence:
1. `auth.js` — verifies JWT, sets `req.userId`
2. `admin.js` — queries user's email, checks against `ADMIN_EMAILS`

### Dashboard Capabilities

- **Stats**: Total users, bikes, bookings by status, revenue, reviews with avg rating, unread messages
- **Charts**: Revenue by month (last 5), bookings by month (last 5), booking status distribution
- **Booking management**: Approve paid bookings, force status changes, release owner payouts
- **Resource management**: Search, paginate, and delete users / bikes / reviews / payments / messages
- **CSV export**: Export any resource with current search/filter applied
- **Audit logs**: Full event history for any booking

### Audit Events Logged
| Event | When |
|---|---|
| `booking_created` | New booking |
| `payment_order_created` | Razorpay order created |
| `payment_verified` | Client-side payment verify success |
| `payment_captured_webhook` | Razorpay webhook capture |
| `payment_failed_webhook` | Razorpay webhook failure |
| `refund_created` | Refund initiated |
| `refund_processed_webhook` | Razorpay webhook refund processed |
| `booking_cancel_requested` | User cancels booking |
| `booking_status_updated` | Status changed by owner/renter |
| `admin_booking_status_update` | Admin force-updates status |
| `admin_booking_approved` | Admin approves paid booking |
| `admin_payout_released` | Admin releases payout |

---

## Key Business Logic

### Pricing Calculation (`bookingPricing.js`)

```
rentalDays = Math.ceil((endDate - startDate) / 86400000) + 1   // inclusive
totalPrice = rentalDays × pricePerDay
platformFee = totalPrice × PLATFORM_FEE_RATE (0.15 = 15%)
ownerAmount = totalPrice - platformFee (85%)
```

Amounts are rounded to 2 decimal places. Razorpay amounts are converted to paise (`× 100`).

### Review Eligibility

A user can only review a bike if:
1. They have a booking for that bike with status `confirmed` or `completed`
2. They are not the bike's owner
3. One review per user per bike (upsert — submitting again updates the existing review)

### Conflict Detection

When creating a booking, the system checks for date overlaps with existing bookings in any of these states: `pending`, `pending_payment`, `paid_pending_confirmation`, `confirmed`, `in_progress`.

Three overlap conditions are checked:
- New start date falls within existing booking
- New end date falls within existing booking
- New booking completely contains an existing booking

### Image Handling

Images are processed client-side before upload:
- Resized to max 1400px width (aspect ratio preserved)
- Compressed as JPEG at 80% quality
- Stored as base64 string in `bikes.image_url`
- Express is configured with a 25MB body limit to accommodate this

### Admin Detection

No `role` column exists in the database. Admin status is determined by checking the user's email against the `ADMIN_EMAILS` comma-separated environment variable. This check happens on every admin API request and on every `isAdmin` flag returned with user profiles.

---

## Notes for Production

- Set a strong, unique `JWT_SECRET` — the default fallback is `'your-secret-key'`
- Replace base64 image storage with an object store (S3, Cloudinary, etc.)
- Add rate limiting (express-rate-limit or similar)
- Add database indexes on `bookings.renter_id`, `bookings.owner_id`, `bookings.bike_id`, `messages.sender_id`, `messages.receiver_id`
- CORS is currently open to all origins — restrict to your frontend domain
- Configure Razorpay webhook URL in the Razorpay dashboard pointing to `https://yourdomain.com/api/webhooks/razorpay`
- Run migrations on every deployment before starting the server
