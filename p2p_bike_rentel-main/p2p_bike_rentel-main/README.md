# 🚲 P2P Bike Rental

A full-stack **Peer-to-Peer Bike Rental Platform** where users can list their bikes for rent and renters can discover, book, and manage bike rentals.

## ✨ Features

* 🔐 User registration & JWT authentication
* 🚲 Add, update and manage bike listings
* 🔍 Browse and search available bikes
* 📅 Create and manage rental bookings
* 💰 Rental price calculation
* 📍 Bike location support
* 💬 User messaging
* 🗄️ PostgreSQL database

## 🛠️ Tech Stack

**Frontend**

* React
* JavaScript
* CSS

**Backend**

* Node.js
* Express.js
* REST API
* JWT
* bcrypt

**Database**

* PostgreSQL

## 📁 Project Structure

```text
p2p_bike_rentel/
├── client/                 # React frontend
├── server/                 # Node.js + Express backend
├── bike_rental_db_schema.sql
└── README.md
```

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/vishal-kumar-0-7/p2p_bike_rentel.git
cd p2p_bike_rentel
```

### 2. Setup Database

Create a PostgreSQL database and import:

```bash
psql -U postgres -d bike_rental -f bike_rental_db_schema.sql
```

### 3. Start Backend

```bash
cd server
npm install
npm start
```

Create a `.env` file:

```env
PORT=5000
DB_USER=postgres
DB_HOST=localhost
DB_NAME=bike_rental
DB_PASSWORD=your_password
DB_PORT=5432
JWT_SECRET=your_secret_key
```

### 4. Start Frontend

```bash
cd client
npm install
npm run dev
```

## 🔄 How It Works

```text
Owner → List Bike → Receive Booking
                         ↓
Renter → Search → Book Bike → Rental
```

## 🔮 Future Improvements

* 💳 Online payments
* 🗺️ Interactive maps
* ⭐ Ratings & reviews
* 🔔 Notifications
* 🛡️ KYC / identity verification
* 📊 Owner analytics
* 📱 Mobile application

* 📌 Project Status

🚧 Development / Academic Project

The project provides the foundation of a peer-to-peer bike rental 
marketplace and can be further extended with payments, maps, reviews, notifications, verification and production deployment.


🤝 Contributing

Contributions are welcome.

1. Fork the repository
git fork
2. Create a feature branch
git checkout -b feature/your-feature
3. Commit your changes
git add .
git commit -m "Add: your feature"
4. Push the branch
5. git push origin feature/your-feature
5. Open a Pull Request

Describe:

What you changed
Why you changed it
How it was tested
#

👨‍💻 Author

Vishal Kumar

GitHub:
https://github.com/vishal-kumar-0-7

Project Repository:
https://github.com/vishal-kumar-0-7/p2p_bike_rentel

---

⭐ If you find this project useful, consider giving it a star!
