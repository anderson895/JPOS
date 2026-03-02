/**
 * JPOS Firebase Seed Script
 * Run this in your browser console after logging into Firebase Console,
 * OR use it as reference to manually create seed data.
 * 
 * Alternatively, paste this into your app's initialization logic.
 */

// Sample Categories
const categories = [
  { name: 'Hot Coffee', color: '#c46820', icon: 'coffee' },
  { name: 'Cold Coffee', color: '#3b82f6', icon: 'coffee' },
  { name: 'Frappe', color: '#8b5cf6', icon: 'coffee' },
  { name: 'Non-Coffee', color: '#10b981', icon: 'cup' },
  { name: 'Food', color: '#f59e0b', icon: 'sandwich' },
  { name: 'Pastries', color: '#ec4899', icon: 'cake' },
];

// Sample Products (use actual category IDs from Firestore)
const products = [
  { name: 'Espresso', price: 90, cost: 25, description: 'Pure bold espresso shot' },
  { name: 'Americano', price: 110, cost: 30, description: 'Espresso diluted with hot water' },
  { name: 'Cappuccino', price: 130, cost: 40, description: 'Espresso with steamed milk foam' },
  { name: 'Latte', price: 140, cost: 45, description: 'Espresso with steamed milk' },
  { name: 'Mocha', price: 155, cost: 50, description: 'Espresso with chocolate and milk' },
  { name: 'Iced Americano', price: 115, cost: 30, description: 'Espresso over ice' },
  { name: 'Iced Latte', price: 145, cost: 45, description: 'Espresso with cold milk' },
  { name: 'Caramel Macchiato', price: 165, cost: 55, description: 'Vanilla latte with caramel drizzle' },
  { name: 'Java Chip Frappe', price: 175, cost: 60, description: 'Blended coffee with chocolate chips' },
  { name: 'Matcha Latte', price: 155, cost: 50, description: 'Premium matcha with steamed milk' },
  { name: 'Hot Choco', price: 120, cost: 35, description: 'Rich hot chocolate' },
  { name: 'Croissant', price: 75, cost: 25, description: 'Buttery flaky pastry' },
];

// Sample Inventory
const inventory = [
  { name: 'Espresso Beans', unit: 'kg', quantity: 15, minStock: 3, maxStock: 30, cost: 580 },
  { name: 'Fresh Milk', unit: 'L', quantity: 20, minStock: 5, maxStock: 40, cost: 75 },
  { name: 'Sugar Syrup', unit: 'L', quantity: 8, minStock: 2, maxStock: 15, cost: 120 },
  { name: 'Chocolate Powder', unit: 'kg', quantity: 4, minStock: 1, maxStock: 10, cost: 250 },
  { name: 'Caramel Syrup', unit: 'L', quantity: 3, minStock: 1, maxStock: 8, cost: 180 },
  { name: 'Matcha Powder', unit: 'kg', quantity: 2, minStock: 0.5, maxStock: 5, cost: 450 },
  { name: 'Whipped Cream', unit: 'pcs', quantity: 10, minStock: 3, maxStock: 20, cost: 145 },
  { name: 'Paper Cups (12oz)', unit: 'pack', quantity: 15, minStock: 5, maxStock: 30, cost: 120 },
  { name: 'Paper Cups (16oz)', unit: 'pack', quantity: 12, minStock: 5, maxStock: 25, cost: 135 },
  { name: 'Straws', unit: 'pack', quantity: 20, minStock: 5, maxStock: 40, cost: 45 },
  { name: 'Napkins', unit: 'pack', quantity: 25, minStock: 8, maxStock: 50, cost: 35 },
];

console.log('Seed data reference - use this to populate your Firestore collections');
console.log('Categories:', categories);
console.log('Products (template):', products);
console.log('Inventory:', inventory);
