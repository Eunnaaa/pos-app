# Product Requirements Document (PRD)

## Kedai-Ku

**Version:** 1.0

**Target Platform**

* Web Application (Desktop First)
* Responsive Mobile
* PWA (Progressive Web App)

---

# 1. Product Vision

Membangun sistem Point of Sale berbasis cloud yang cepat, mudah digunakan, mendukung multi cabang, inventory real-time, laporan bisnis, AI analytics, serta dapat digunakan secara offline ketika internet terputus.

---

# 2. Target User

### Retail

* Minimarket
* Toko Kelontong
* Fashion Store
* Elektronik
* Cosmetic

### Food & Beverage

* Cafe
* Coffee Shop
* Restaurant
* Bakery
* Street Food

### Service

* Barbershop
* Salon
* Laundry
* Workshop

---

# 3. User Roles

## Owner

Hak akses penuh

* Dashboard
* Semua laporan
* Pengaturan
* Manajemen cabang
* Keuangan
* User

---

## Manager

* Inventory
* Sales
* Customer
* Supplier
* Laporan

---

## Cashier

* POS
* Transaksi
* Return
* Customer

---

## Warehouse

* Stock
* Purchase
* Transfer Stock

---

## Accountant

* Finance
* Profit Loss
* Expense

---

# 4. Core Modules

---

## Dashboard

### KPI

Hari ini

* Total Sales
* Profit
* Orders
* Customers

Grafik

* Sales Trend
* Top Product
* Category
* Best Cashier

Realtime Cards

* Low Stock
* Pending Orders
* Today's Expense
* New Customer

---

## POS Module

### Modern POS Screen

Split Screen

Left

* Search Product
* Category
* Barcode Scan

Right

Cart

Bottom

Payment

---

### Product Search

Support

✔ Barcode

✔ QR Code

✔ SKU

✔ Product Name

✔ Voice Search (AI)

---

### Cart Features

* Add Note
* Discount Item
* Discount Order
* Change Quantity
* Hold Order
* Merge Order
* Split Bill
* Draft Transaction

---

### Payment

Support

Cash

Debit

Credit

QRIS

E-Wallet

Transfer

PayLater

Multiple Payment

Contoh

Cash Rp50.000

QRIS Rp25.000

---

### Receipt

Digital Receipt

Print

WhatsApp

Email

PDF

QR Verification

---

# Inventory

### Product

* CRUD
* Unlimited Variant
* Bundle Product
* Composite Product
* Serial Number
* Expired Product

---

### Category

Unlimited Nested Category

---

### Brand

CRUD

---

### Unit

PCS

BOX

PACK

KG

Liter

Custom Unit

---

### Stock

Real Time

Movement

History

Adjustment

Stock Opname

Transfer

Reservation

---

### Barcode

Generate

Print

Import

---

# Purchase

Supplier

Purchase Order

Receive Item

Purchase Return

Invoice

Payment

---

# Sales

Order

Invoice

Quotation

Sales Return

Refund

Partial Refund

---

# Customer CRM

Customer Profile

Purchase History

Member Level

Point

Voucher

Birthday

Loyalty

Store Credit

Customer Notes

---

# Loyalty System

Point Reward

Membership

Referral

Coupon

Promo Code

Cashback

---

# Promotion Engine

Buy X Get Y

Discount %

Discount Fixed

Bundle

Happy Hour

Flash Sale

Weekend Promo

Birthday Promo

---

# Kitchen Display System (F&B)

Order Queue

Cooking Status

Ready

Served

Priority

---

# Reservation (Restaurant)

Table Management

Booking

Waiting List

---

# Inventory AI

AI Prediction

* Out of Stock Prediction
* Purchase Recommendation
* Slow Moving Product
* Fast Moving Product

---

# Reporting

Sales

Daily

Weekly

Monthly

Yearly

---

Inventory

Stock

Movement

Dead Stock

---

Finance

Revenue

Expense

Profit

Cash Flow

---

Customer

Retention

Lifetime Value

Repeat Order

---

Employee

Cashier Performance

Sales Performance

Attendance

---

# Finance

Expense

Income

Petty Cash

Bank Account

Cash Flow

Profit Loss

---

# Employee

Shift

Attendance

Commission

Salary Reference

---

# Multi Branch

Unlimited Branch

Separate Stock

Transfer

Consolidated Report

---

# Multi Warehouse

Warehouse

Transfer

Receiving

---

# Notification

Email

WhatsApp

Telegram

Push Notification

Low Stock Alert

---

# File Manager

Upload

Image

PDF

Excel

CSV

---

# Import Export

Excel

CSV

Backup

Restore

---

# API

REST API

Webhook

GraphQL (Optional)

---

# Integrations

QRIS

Midtrans

Xendit

WhatsApp

Google Drive Backup

Google Login

Apple Login

---

# Security

2FA

Role Permission

Audit Log

Session Management

Device Login

IP Restriction

---

# Offline Mode

PWA Cache

Offline Transaction

Auto Sync

Conflict Resolver

---

# AI Features (2026)

### AI Assistant

Contoh

"Berapa penjualan minggu ini?"

AI menjawab langsung.

---

### Smart Recommendation

"Produk A sering dibeli bersama Produk B"

---

### AI Forecast

Prediksi penjualan

30 hari

90 hari

1 tahun

---

### AI Stock Planning

Menyarankan kapan membeli stok.

---

### AI Fraud Detection

Mendeteksi transaksi mencurigakan.

---

### AI Customer Segmentation

Mengelompokkan pelanggan otomatis.

---

### AI Invoice OCR

Foto invoice supplier

↓

Otomatis menjadi Purchase Order.

---

### AI Receipt OCR

Scan struk lama

↓

Import transaksi.

---

# Mobile Features

Camera Barcode

QR Scanner

Digital Signature

GPS Delivery

Offline Mode

---

# Settings

Store

Currency

Language

Tax

Receipt

Theme

Backup

---

# Admin Panel (Filament)

Dashboard

User

Role

Permission

Products

Inventory

Customers

Supplier

Purchase

Sales

Finance

Reports

Settings

---

# Tech Stack

Backend

* Laravel 12
* PHP 8.4

Admin Panel

* Filament 4

Database

* Supabase PostgreSQL

Authentication

* Laravel Sanctum

Permission

* Spatie Permission

Queue

* Laravel Queue

Realtime

* Laravel Reverb + Supabase Realtime

Storage

* Supabase Storage

Search

* Laravel Scout + Meilisearch

Payment

* Midtrans
* Xendit

Frontend

* Livewire 4
* Volt
* Alpine.js
* Tailwind CSS

Charts

* ApexCharts

Excel

* Laravel Excel

PDF

* DomPDF

Barcode

* milon/barcode

QR Code

* Simple QRCode

Notifications

* Laravel Notifications

---

# Future Roadmap

**V1**

* POS
* Inventory
* Purchase
* Sales
* Customer
* Reports

**V2**

* Loyalty
* CRM
* Multi Branch
* Finance
* Promotion Engine

**V3**

* AI Analytics
* AI Forecast
* AI OCR
* AI Assistant
* Mobile App

## Rekomendasi struktur modular

Karena Anda sebelumnya ingin menggunakan **Laravel + Filament + Supabase Cloud**, saya menyarankan arsitektur berbasis modul agar aplikasi mudah dikembangkan. Contoh modul:

```
Modules/
├── Auth
├── Dashboard
├── POS
├── Products
├── Inventory
├── Purchases
├── Sales
├── Customers
├── Suppliers
├── Promotions
├── Loyalty
├── Finance
├── Reports
├── Employees
├── Branches
├── Warehouses
├── Notifications
├── AI
├── Integrations
└── Settings
```

Struktur ini memudahkan penambahan fitur baru tanpa mengganggu modul lain, serta cocok jika nantinya aplikasi berkembang menjadi SaaS (Software as a Service) dengan banyak tenant dan cabang.
