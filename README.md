# JPOS — Coffee Shop Point of Sale System

A full-featured POS and inventory management system built with **React + TypeScript + Tailwind CSS + Firebase**.

📄 **Backend change log:** see [`docs/BACKEND_CHANGES.md`](docs/BACKEND_CHANGES.md) for every bug fix, the new Google sign-in, and the Firebase steps still to do.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Firebase project (already configured)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## 🔥 Firebase Setup

### 1. Authentication
In Firebase Console → Authentication → Sign-in methods:
- Enable **Email/Password**
- Enable **Google** (for "Continue with Google")

For Google sign-in on the live site, also add its domain (e.g. `your-app.vercel.app`) under
Authentication → Settings → **Authorized domains** (`localhost` is allowed by default).

How Google sign-in works in JPOS:
- Only emails already in JPOS can use it (added in **Manage Staff**, or the first admin). Unknown Google accounts are turned away.
- For a **Gmail** address, Firebase signs in to the existing JPOS account (same user). If that email was never verified,
  Firebase removes the account's password at that moment. JPOS puts it back automatically when the person has an RFID card;
  otherwise that person keeps using Google sign-in from then on.
- A non-Gmail email that already has a password login can't use Google; keep using email/password or RFID.

### 2. Firestore Database
Create the following collections:

#### `users`
```json
{
  "displayName": "Admin User",
  "email": "admin@jpos.com",
  "role": "admin",
  "isActive": true,
  "rfidTag": "RFID001",
  "photoURL": "",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### `products`
```json
{
  "name": "Iced Americano",
  "description": "Bold espresso over ice",
  "price": 120,
  "cost": 40,
  "categoryId": "cat-id",
  "categoryName": "Cold Coffee",
  "imageUrl": "",
  "isAvailable": true,
  "variants": [],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### `categories`
```json
{
  "name": "Hot Coffee",
  "color": "#c46820",
  "icon": "coffee",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

#### `inventory`
```json
{
  "name": "Coffee Beans",
  "unit": "kg",
  "quantity": 10,
  "minStock": 2,
  "maxStock": 20,
  "cost": 500,
  "supplierName": "Local Roasters",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

#### `orders` (auto-created by POS)

#### `stockMovements` (auto-created by Stock Management)

### 3. Firestore Security Rules

> ⚠️ These rules only take effect once published in **Firebase Console → Firestore Database → Rules**.
> The previous version let anyone list every RFID card (with its saved password) and let any
> signed-in user give themselves the `admin` role — publish this version to close both holes.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isActive == true;
    }
    function isActiveUser() {
      return request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isActive == true;
    }

    match /users/{userId} {
      // Own profile only; admins can see everyone (Staff Management)
      allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
      // Only admins create/delete accounts (create the very first admin in the console)
      allow create, delete: if isAdmin();
      // Users may change their own name/photo — never their role or active status
      allow update: if isAdmin() || (
        request.auth != null && request.auth.uid == userId &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['displayName', 'photoURL', 'updatedAt'])
      );
    }
    match /products/{id} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }
    match /categories/{id} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }
    match /orders/{id} {
      allow read: if isActiveUser();
      // Cashiers can only record orders under their own account
      allow create: if isActiveUser() && request.resource.data.cashierId == request.auth.uid;
      allow update, delete: if isAdmin();
    }

    // RFID login looks up a single card BEFORE signing in, so `get` stays public,
    // but listing all cards (and their saved passwords) is blocked.
    // Staff accounts are created on a secondary app, so the admin's session
    // stays signed in and admin-only writes work.
    match /rfidCards/{tag} {
      allow get: if true;
      allow list: if false;
      allow write: if isAdmin();
    }
  }
}
```

### 4. Creating First Admin

JPOS never creates an admin automatically, and with the rules above only an admin can create accounts, so create the first admin manually:

1. Go to Firebase Console → Authentication → Users → Add User
2. Add email/password
3. Copy the UID
4. Go to Firestore → `users` collection → Add document with the UID as document ID
5. Set fields: `role: "admin"`, `isActive: true`, `displayName: "Your Name"`, etc.

---

## 📱 Features

### Admin Panel
- **Dashboard** — Real-time sales analytics, charts, low stock alerts
- **Point of Sale** — Full POS with cart, discounts, multiple payment methods, receipts
- **Products** — CRUD with Cloudinary image upload, category management, availability toggle
- **Stock Management** — Inventory tracking, stock adjustments (in/out/set), movement history
- **Reports** — Date range filtering, sales charts, top products, order history
- **Staff Management** — Create/manage staff accounts, RFID tag assignment, role management

### Staff Portal
- **Dashboard** — Personal sales stats, recent orders
- **Point of Sale** — Same full POS functionality

### Authentication
- Email/Password login
- Google sign-in (registered accounts only)
- RFID card scan (physical reader emulates keyboard)
- Role-based access (admin vs staff)

---

## 🎨 Tech Stack

- **React 18** + **TypeScript**
- **Tailwind CSS** — Custom coffee shop theme
- **Firebase** — Auth, Firestore, Storage
- **Cloudinary** — Image uploads
- **Recharts** — Analytics charts
- **React Router v6** — Client-side routing
- **Lucide React** — Icons
- **react-hot-toast** — Notifications
- **date-fns** — Date utilities

---

## 📁 Project Structure

```
src/
├── components/
│   ├── admin/       # AdminLayout
│   ├── staff/       # StaffLayout
│   └── shared/      # POSComponent, LoadingScreen
├── contexts/
│   ├── AuthContext.tsx
│   └── CartContext.tsx
├── lib/
│   ├── firebase.ts
│   ├── cloudinary.ts
│   └── utils.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── admin/       # Dashboard, Products, Stock, Reports, POS, Staff
│   └── staff/       # Dashboard, POS
└── types/
    └── index.ts
```

---

## 💳 RFID Setup

The RFID reader should be configured in HID (keyboard emulation) mode. When a card is scanned, it sends the card UID as keystrokes followed by Enter. The system automatically captures this input on the RFID login screen.

To assign RFID tags to staff:
1. Go to Admin → Staff Management
2. Edit the staff member
3. Enter or scan the RFID tag in the "RFID Tag" field

---

## 🖨 Receipt Printing

Click "Print" on the receipt modal to print via the browser's print dialog. For thermal printers, configure the paper width to 80mm in printer settings.
