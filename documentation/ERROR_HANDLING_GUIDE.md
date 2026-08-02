# Error & Success Handling Guide - Kasir-Ku POS

Panduan komprehensif untuk implementasi error dan success handling menggunakan **gooey-toast** di seluruh aplikasi Kasir-Ku.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Toast Handler](#toast-handler)
3. [API Error Handler](#api-error-handler)
4. [Client-Side Usage](#client-side-usage)
5. [Server-Side Usage](#server-side-usage)
6. [Best Practices](#best-practices)
7. [Examples](#examples)

---

## Overview

Sistem error handling terdiri dari 3 komponen utama:

- **`lib/toast-handler.ts`** - Client-side toast notifications
- **`lib/server/error-handler.ts`** - Server-side error handling
- **`hooks/use-api-mutation.ts`** - React hook untuk mutations dengan toast

---

## Toast Handler

### Fungsi Utama

#### `showSuccess(message, options?)`
Menampilkan notifikasi sukses.

```typescript
import { toastHandler } from '@/lib/toast-handler';

toastHandler.showSuccess('Produk berhasil ditambahkan');

// Dengan options
toastHandler.showSuccess('Produk berhasil ditambahkan', {
  duration: 2000,
  position: 'top-right',
});
```

#### `showError(message, options?)`
Menampilkan notifikasi error.

```typescript
toastHandler.showError('Gagal menambahkan produk', {
  duration: 5000,
  error: new Error('Network error'),
});
```

#### `showWarning(message, options?)`
Menampilkan notifikasi warning.

```typescript
toastHandler.showWarning('Stok produk hampir habis');
```

#### `showInfo(message, options?)`
Menampilkan notifikasi info.

```typescript
toastHandler.showInfo('Memperbarui data...');
```

#### `handleApiError(error, defaultMessage?, options?)`
Mengkonversi API error ke user-friendly message.

```typescript
try {
  await fetchData();
} catch (error) {
  toastHandler.handleApiError(error, 'Gagal mengambil data');
}
```

**Automatic Error Messages:**
- 401: "Sesi Anda telah berakhir. Silakan login kembali."
- 403: "Anda tidak memiliki akses untuk operasi ini."
- 404: "Data tidak ditemukan."
- 409: "Data sudah ada atau terjadi konflik."
- 422: "Data yang dikirim tidak valid."
- 500: "Kesalahan server. Silakan coba lagi nanti."
- 503: "Server sedang dalam pemeliharaan. Silakan coba lagi nanti."

#### `handleValidationError(errors, options?)`
Menangani validation errors dari form.

```typescript
const errors = {
  email: 'Email tidak valid',
  password: 'Password minimal 8 karakter',
};

toastHandler.handleValidationError(errors);
```

#### `handleCrudSuccess(operation, resourceName?, options?)`
Menampilkan success message untuk CRUD operations.

```typescript
// Create
toastHandler.handleCrudSuccess('create', 'Produk');
// Output: "Produk berhasil ditambahkan"

// Update
toastHandler.handleCrudSuccess('update', 'Produk');
// Output: "Produk berhasil diperbarui"

// Delete
toastHandler.handleCrudSuccess('delete', 'Produk');
// Output: "Produk berhasil dihapus"

// Restore
toastHandler.handleCrudSuccess('restore', 'Produk');
// Output: "Produk berhasil dipulihkan"
```

#### `showLoading(message?, options?)`
Menampilkan loading toast (tidak auto-dismiss).

```typescript
const toastId = toastHandler.showLoading('Memproses pembayaran...');

// Kemudian close/update ketika selesai
```

#### `withToastNotification(operation, options?)`
Wrapper untuk operasi async dengan automatic toast handling.

```typescript
const result = await toastHandler.withToastNotification(
  async () => {
    return await createProduct(data);
  },
  {
    loadingMessage: 'Menambahkan produk...',
    successMessage: 'Produk berhasil ditambahkan',
    errorMessage: 'Gagal menambahkan produk',
  }
);
```

---

## API Error Handler

### Server-Side Error Handling

#### `successResponse<T>(data, requestId?)`
Return success response dengan format standard.

```typescript
import { successResponse } from '@/lib/server/error-handler';

export async function GET(req: Request) {
  const products = await db.product.findMany();
  return NextResponse.json(successResponse(products));
}
```

#### `errorResponse(statusCode, code, message, details?, requestId?)`
Return error response dengan format standard.

```typescript
import { errorResponse } from '@/lib/server/error-handler';

return NextResponse.json(
  errorResponse(
    404,
    ERROR_CODES.NOT_FOUND,
    'Product not found'
  ),
  { status: 404 }
);
```

#### `ApiError` Class
Custom error class untuk API errors.

```typescript
import { ApiError } from '@/lib/server/error-handler';

throw new ApiError(
  400,
  'INVALID_QUANTITY',
  'Quantity tidak boleh lebih besar dari stok'
);
```

#### Helper Functions
Quick throw functions untuk common errors.

```typescript
import {
  throwBadRequest,
  throwUnauthorized,
  throwForbidden,
  throwNotFound,
  throwConflict,
  throwValidationError,
  throwInternalError,
} from '@/lib/server/error-handler';

// Usage
if (!data) {
  throwNotFound('Data tidak ditemukan');
}

if (quantity > stock) {
  throwBadRequest('Quantity melebihi stok', { available: stock });
}

if (isDuplicate) {
  throwConflict('Email sudah terdaftar');
}
```

#### `withErrorHandler` Middleware
Wrap route handler dengan automatic error handling.

```typescript
import { withErrorHandler, successResponse } from '@/lib/server/error-handler';

export const POST = withErrorHandler(async (req) => {
  const body = await req.json();
  const product = await db.product.create({ data: body });
  return NextResponse.json(successResponse(product));
});
```

---

## Client-Side Usage

### Using useApiMutation Hook

```typescript
'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';

export function CreateProductForm() {
  const createMutation = useApiMutation(
    async (data) => {
      const res = await fetch('/api/v1/products', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create');
      return res.json();
    },
    {
      onSuccess: (data) => {
        console.log('Product created:', data);
        // Refetch, redirect, etc.
      },
      successMessage: 'Produk berhasil ditambahkan',
      errorMessage: 'Gagal menambahkan produk',
    }
  );

  const handleSubmit = async (formData: any) => {
    try {
      await createMutation.mutate(formData);
    } catch (error) {
      // Error already handled by toast
    }
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit(new FormData(e.currentTarget));
    }}>
      {/* Form fields */}
      <button disabled={createMutation.isLoading}>
        {createMutation.isLoading ? 'Loading...' : 'Create'}
      </button>
    </form>
  );
}
```

### Direct Toast Usage

```typescript
'use client';

import { toastHandler } from '@/lib/toast-handler';

export function CheckoutButton() {
  const handleCheckout = async () => {
    try {
      const result = await toastHandler.withToastNotification(
        async () => {
          const res = await fetch('/api/v1/pos/checkout', {
            method: 'POST',
            body: JSON.stringify(checkoutData),
          });
          if (!res.ok) throw new Error('Checkout failed');
          return res.json();
        },
        {
          loadingMessage: 'Memproses pembayaran...',
          successMessage: 'Pembayaran berhasil',
          errorMessage: 'Pembayaran gagal',
        }
      );

      if (result) {
        // Navigate atau refresh
      }
    } catch (error) {
      // Already handled
    }
  };

  return <button onClick={handleCheckout}>Checkout</button>;
}
```

---

## Server-Side Usage

### API Route Example

```typescript
// app/api/v1/products/route.ts

import { withErrorHandler, successResponse, throwValidationError } from '@/lib/server/error-handler';
import { NextResponse } from 'next/server';

export const POST = withErrorHandler(async (req) => {
  const body = await req.json();

  // Validate
  if (!body.name) {
    throwValidationError('Product name is required');
  }

  // Create
  const product = await db.product.create({
    data: body,
  });

  return NextResponse.json(successResponse(product), { status: 201 });
});
```

### Service Layer Example

```typescript
// lib/services/checkout.ts

import { throwInternalError, throwBadRequest } from '@/lib/server/error-handler';

export async function processCheckout(data: CheckoutData) {
  // Validate stock
  const stock = await db.stock.findFirst({
    where: { productId: data.productId },
  });

  if (!stock || stock.available < data.quantity) {
    throwBadRequest('Insufficient stock', {
      requested: data.quantity,
      available: stock?.available ?? 0,
    });
  }

  // Process
  try {
    const order = await db.salesOrder.create({ data: checkoutData });
    return order;
  } catch (error) {
    throwInternalError('Failed to create order', { raw: error });
  }
}
```

---

## Best Practices

### 1. Use Specific Error Messages
✅ Good:
```typescript
throwBadRequest('Email sudah terdaftar', { email: data.email });
```

❌ Bad:
```typescript
throwBadRequest('Invalid data');
```

### 2. Handle All Error Paths
```typescript
export const POST = withErrorHandler(async (req) => {
  // All errors are caught and formatted
  const data = await req.json(); // JSON parse error caught
  const product = await createProduct(data); // Service error caught
  return NextResponse.json(successResponse(product));
});
```

### 3. Use Appropriate HTTP Status Codes
- 400: Bad request, validation error
- 401: Unauthorized (missing/invalid auth)
- 403: Forbidden (auth ok, but no permission)
- 404: Resource not found
- 409: Conflict (duplicate, state violation)
- 422: Validation error
- 500: Server error

### 4. Prevent Toast Duplicates
Toast handler automatically prevents duplicate toasts:
```typescript
// Showing same toast twice won't duplicate
toastHandler.showError('Error message');
toastHandler.showError('Error message'); // Won't show again
```

### 5. Custom Success Messages for CRUD
```typescript
// Generic
toastHandler.handleCrudSuccess('create', 'Product');

// Custom
toastHandler.showSuccess('Produk berhasil ditambahkan ke katalog');
```

### 6. Error Context for Debugging
```typescript
toastHandler.showError('Payment failed', {
  error: new Error('Gateway timeout'),
  details: { transactionId: '12345' },
});
```

---

## Examples

### Complete Form Example

```typescript
'use client';

import { useState } from 'react';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { toastHandler } from '@/lib/toast-handler';

export function ProductForm() {
  const [formData, setFormData] = useState({ name: '', price: '' });

  const createMutation = useApiMutation(
    async (data) => {
      const res = await fetch('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw error;
      }

      return res.json();
    },
    {
      onSuccess: (data) => {
        setFormData({ name: '', price: '' });
        // Refetch products list
      },
      successMessage: 'Produk berhasil ditambahkan',
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    if (!formData.name || !formData.price) {
      toastHandler.showWarning('Semua field harus diisi');
      return;
    }

    try {
      await createMutation.mutate({
        name: formData.name,
        price: parseFloat(formData.price),
      });
    } catch (error) {
      // Error already handled by toast
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Product name"
      />
      <input
        value={formData.price}
        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
        placeholder="Price"
        type="number"
      />
      <button disabled={createMutation.isLoading} type="submit">
        {createMutation.isLoading ? 'Creating...' : 'Create Product'}
      </button>
    </form>
  );
}
```

### Complete API Route Example

```typescript
// app/api/v1/pos/checkout/route.ts

import {
  withErrorHandler,
  successResponse,
  throwBadRequest,
  throwNotFound,
} from '@/lib/server/error-handler';
import { NextResponse } from 'next/server';
import { processCheckout } from '@/lib/services/checkout';

export const POST = withErrorHandler(async (req) => {
  const body = await req.json();

  // Get customer
  const customer = await db.customer.findUnique({
    where: { id: body.customerId },
  });

  if (!customer) {
    throwNotFound('Customer not found');
  }

  // Process checkout
  const order = await processCheckout(body);

  return NextResponse.json(successResponse(order), { status: 201 });
});
```

---

## Response Format

### Success Response
```json
{
  "data": { "id": "123", "name": "Product" },
  "meta": {
    "timestamp": "2026-08-02T12:03:12.086Z",
    "requestId": "1722592592086-abc123"
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email sudah terdaftar",
    "details": { "email": "user@example.com" },
    "timestamp": "2026-08-02T12:03:12.086Z",
    "requestId": "1722592592086-abc123"
  }
}
```

---

## Summary

Sistem error handling yang comprehensive mencakup:
- ✅ Client-side toast notifications (gooey-toast)
- ✅ Server-side error parsing & formatting
- ✅ Custom React hook untuk mutations
- ✅ Type-safe error codes
- ✅ Automatic error message mapping
- ✅ Request ID tracking
- ✅ Duplicate prevention
- ✅ Flexible positioning & duration

