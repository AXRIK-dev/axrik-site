---
name: supabase-patterns
description: Standard Supabase patterns for Phil's web app projects — covers database schema design, Row Level Security policies, auth with role-based access, client-side JS helpers, edge functions, and triggers. Use this skill whenever building or modifying anything that touches Supabase, including creating tables, writing RLS policies, setting up auth, querying data from the frontend, or adding database triggers. Also use when the user mentions Supabase, Postgres, RLS, database security, migrations, or role-based access — even if they don't explicitly ask for "patterns." Also covers the AXRIK ordering-business patterns: day-one role-based RLS (admin/staff/account/public), the place_order RPC, slot-count and order-total triggers, the null-safe signup trigger, the app_settings config table, price snapshots, and the self-service manage-users Netlify function.
---

# Supabase Patterns

Phil builds bespoke web apps for small businesses using a lean stack: vanilla HTML/JS on the frontend, Supabase (Postgres + Auth + Realtime) as the backend, deployed on Netlify. Every project shares common infrastructure patterns. This skill captures those patterns so you don't reinvent them each time.

The guiding principles behind these patterns:

- **Simplicity over abstraction.** Phil's clients are small businesses. The code needs to be maintainable by one person, readable months later, and easy to extend when a new feature is needed.
- **Security by default.** Every table gets RLS policies from day one. No "we'll add security later."
- **Reusability across niches.** Each project becomes a template for the next client in the same vertical. Patterns should be generic enough to work for a butcher's delivery app, a farm shop, or a mobile bakery — but specific enough to be useful.

---

## 1. Project Initialisation

### Supabase Client Setup

Every project uses a single `supabase.js` file that initialises the client. Keep it minimal.

```javascript
// supabase.js — single source of truth for the Supabase client
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

Load the Supabase JS library from CDN in your HTML (keeps things simple, no build step):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="supabase.js"></script>
```

Why CDN rather than npm? Phil's stack is vanilla HTML/JS with no build tooling. The CDN approach means zero config, instant setup, and one fewer thing to maintain. If a project ever needs a build step, this can be revisited — but start simple.

---

## 2. Authentication

### Standard Auth Flow

Phil's apps use Supabase Auth with email/password sign-up. Magic links or OAuth can be added per project, but email/password is the baseline.

```javascript
// Sign up
async function signUp(email, password, role = 'user') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role } // stored in auth.users.raw_user_meta_data
    }
  });
  if (error) throw error;
  return data;
}

// Sign in
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

// Sign out
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/login.html';
}

// Get current user
function getCurrentUser() {
  return supabase.auth.getUser();
}

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = '/login.html';
  }
});
```

### Role-Based Access

Roles are stored in `raw_user_meta_data` on the auth user. The standard roles are `admin` and `user`, but projects can add more (e.g. `driver`, `manager`).

```javascript
// Check user role client-side (for UI decisions — never trust this for security)
async function getUserRole() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role || 'user';
}

// Guard a page — redirect if not the right role
async function requireRole(allowedRoles) {
  const role = await getUserRole();
  if (!allowedRoles.includes(role)) {
    window.location.href = '/unauthorised.html';
  }
}
```

The real enforcement happens in RLS policies (see section 3). Client-side role checks are only for showing/hiding UI elements — they're a convenience, not a security boundary.

### Setting Roles via SQL (Admin Operations)

When an admin needs to change a user's role, do it via a Postgres function rather than exposing `auth.users` to the client:

```sql
-- Function to update a user's role (callable by admins only)
CREATE OR REPLACE FUNCTION update_user_role(target_user_id UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
  -- Verify the caller is an admin
  IF NOT (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin') THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', new_role)
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 3. Row Level Security (RLS)

RLS is non-negotiable. Every table gets policies. The patterns below cover the most common scenarios.

### Enable RLS on Every Table

```sql
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
```

Do this immediately after creating a table. No exceptions.

### Pattern: Users See Their Own Data

The most common pattern — each row belongs to a user, and users can only see and modify their own rows.

```sql
-- Read own rows
CREATE POLICY "Users read own data"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

-- Insert own rows
CREATE POLICY "Users insert own data"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update own rows
CREATE POLICY "Users update own data"
  ON orders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete own rows
CREATE POLICY "Users delete own data"
  ON orders FOR DELETE
  USING (auth.uid() = user_id);
```

### Pattern: Admins See Everything

Admins need full access. This checks the role stored in `user_metadata`.

```sql
-- Admin full access (apply to each operation: SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Admins have full access"
  ON orders FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
```

### Pattern: Organisation/Tenant Scoping

For apps where multiple businesses share the same tables (multi-tenant), scope rows by an `organisation_id`.

```sql
-- Users see rows belonging to their organisation
CREATE POLICY "Org members read org data"
  ON products FOR SELECT
  USING (
    organisation_id = (
      SELECT organisation_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );
```

### Pattern: Public Read, Authenticated Write

Some tables (e.g. a product catalogue) need to be publicly readable but only editable by authenticated users.

```sql
-- Anyone can read
CREATE POLICY "Public read access"
  ON products FOR SELECT
  USING (true);

-- Only authenticated users can insert/update
CREATE POLICY "Authenticated users can insert"
  ON products FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

### RLS Checklist

When creating a new table, work through this list:

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` — always first
2. Who can SELECT? (own data, org data, public, admin-only?)
3. Who can INSERT? (any authenticated user, or only certain roles?)
4. Who can UPDATE? (own rows only, or admins too?)
5. Who can DELETE? (usually restricted — soft deletes are often safer)
6. Does the table need a `user_id` or `organisation_id` column for scoping?

---

## 4. Table Schema Patterns

### Standard Columns

Every table should include these baseline columns:

```sql
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  -- ... business columns ...
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

- `id` as UUID, not serial integers — better for distributed systems and doesn't leak row counts.
- `user_id` referencing `auth.users(id)` — the ownership link for RLS.
- `created_at` and `updated_at` — always include both. Use a trigger (below) to auto-update `updated_at`.

### Auto-Update updated_at

```sql
-- Reusable trigger function (create once per database)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to each table
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Common Business Tables

These are the table structures that recur across Phil's niche business apps. Adapt the column names to fit the domain, but the shape stays consistent.

**Customers**
```sql
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

**Orders**
```sql
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE NOT NULL,
  delivery_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled')),
  total_amount NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

**Order Items**
```sql
CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'each',
  unit_price NUMERIC(10,2) NOT NULL,
  line_total NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

**Products / Services**
```sql
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'each',
  price NUMERIC(10,2) NOT NULL,
  category TEXT,
  is_available BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### User Profiles

A `user_profiles` table supplements `auth.users` with app-specific data. Create it via a trigger on user signup.

```sql
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT,
  business_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'user',
  organisation_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();
```

---

## 5. Client-Side Query Patterns

### Standard CRUD Operations

Keep query functions clean, consistent, and close to the page that uses them. Each function returns `{ data, error }` — handle errors at the call site.

```javascript
// Fetch all (with optional filters)
async function getOrders(filters = {}) {
  let query = supabase
    .from('orders')
    .select('*, customers(name), order_items(*)')
    .order('order_date', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.from_date) {
    query = query.gte('order_date', filters.from_date);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Fetch single record
async function getOrder(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(name, phone, address_line_1, postcode), order_items(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Insert
async function createOrder(orderData) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('orders')
    .insert({ ...orderData, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Update
async function updateOrder(id, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete (preferred) — set a flag rather than removing the row
async function archiveOrder(id) {
  return updateOrder(id, { status: 'cancelled' });
}

// Hard delete (when truly needed)
async function deleteOrder(id) {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
```

### Error Handling Pattern

Wrap Supabase calls in a consistent error handler to show user-friendly messages:

```javascript
async function handleSupabaseAction(action, successMessage) {
  try {
    const result = await action();
    if (successMessage) showToast(successMessage, 'success');
    return result;
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Something went wrong. Please try again.', 'error');
    return null;
  }
}

// Usage
const order = await handleSupabaseAction(
  () => createOrder({ customer_id: customerId, delivery_date: date }),
  'Order created successfully'
);
```

### Realtime Subscriptions

For dashboards or order tracking where data needs to update live:

```javascript
// Subscribe to changes on a table
function subscribeToOrders(callback) {
  const channel = supabase
    .channel('orders-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      (payload) => callback(payload)
    )
    .subscribe();

  // Return unsubscribe function for cleanup
  return () => supabase.removeChannel(channel);
}

// Usage
const unsubscribe = subscribeToOrders((payload) => {
  console.log('Change:', payload.eventType, payload.new);
  refreshOrderList(); // re-fetch and re-render
});

// Call unsubscribe() when navigating away or cleaning up
```

### Pagination

For tables that could grow large (order history, customer lists):

```javascript
async function getOrdersPaginated(page = 1, pageSize = 20) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('orders')
    .select('*, customers(name)', { count: 'exact' })
    .order('order_date', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return {
    orders: data,
    total: count,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize)
  };
}
```

---

## 6. Database Functions & Triggers

### Computed Totals

When an order's items change, automatically update the order total:

```sql
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET total_amount = (
    SELECT COALESCE(SUM(quantity * unit_price), 0)
    FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  )
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recalculate_order_total
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_order_total();
```

### Audit Trail

For apps where you need to track who changed what:

```sql
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to any table that needs auditing
CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger();
```

---

## 7. Edge Functions

Use Supabase Edge Functions (Deno) for server-side logic that can't live in the browser — sending emails, generating PDFs server-side, processing webhooks, or calling third-party APIs with secret keys.

### Guidance (not boilerplate — these vary too much per project)

**When to use Edge Functions:**
- You need server-side secrets (API keys for EmailJS, payment processors, etc.)
- You need to call external APIs that have CORS restrictions
- You need heavy computation that shouldn't block the UI
- You need webhook endpoints (e.g. payment confirmations)

**When NOT to use Edge Functions:**
- Simple CRUD — use the client library + RLS instead
- Data validation — use Postgres CHECK constraints and triggers
- Computed columns — use GENERATED ALWAYS AS or trigger functions

**Structure of an Edge Function:**
```typescript
// supabase/functions/send-order-confirmation/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify the request has a valid auth token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 });
  }

  // Create a Supabase client with the user's token
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Your logic here...
  const { order_id } = await req.json();

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

**Calling from the client:**
```javascript
const { data, error } = await supabase.functions.invoke('send-order-confirmation', {
  body: { order_id: orderId }
});
```

---

## 8. Migration & Deployment Notes

### Local Development

Use the Supabase CLI for local development when practical:

```bash
supabase init
supabase start        # local Postgres + Auth + Realtime
supabase db reset     # reset to migration state
supabase migration new create_orders_table
```

### Migration Best Practices

- One migration per logical change (don't bundle unrelated schema changes)
- Always include RLS policies in the same migration as the table they protect
- Test migrations locally with `supabase db reset` before pushing
- Keep a `seed.sql` for test data

### Environment Variables on Netlify

Store Supabase credentials as Netlify environment variables for any build-time needs. For client-side apps, the anon key is public by design (RLS protects the data), so it's fine to have it in the JS — but never expose the `service_role` key client-side.

---

## 9. AXRIK build-proven patterns (day-one, from JG Foods)

These are the additions that turn the generic patterns above into the **correct end-state from day one**. On the first AXRIK build (JG Foods) each of these was discovered the hard way — RLS was re-hardened across four migrations, the slot-count trigger missed the order-*move* case, the signup trigger broke on null metadata, and business config was hard-coded. Build from these and you skip that rework.

**Ground rules:**

- The two ends (customer website + back-office admin) are **one system sharing one database**. Model the schema from the client's real spreadsheets/messages *before* writing screens.
- Land the whole spine in **three consolidated SQL files** (`001_base_schema`, `002_roles_and_rls`, `003_place_order_rpc`), not incremental migrations.
- Lines marked `>>> CUSTOMISE` are the per-client knobs (delivery days, channels, reference prefix, role names).

### 9.1 Role-based RLS from day one (not "broad then harden")

Ship role-based RLS in the **first** RLS migration. Never ship `auth.role() = 'authenticated'` and tighten later — that cost JG Foods four extra migrations.

Model: public storefront writing into an operator-managed system —
`admin` (owner, full access incl. finance) · `staff` (driver/assistant: delivery-facing tables only, **no finance**) · account customer (reads only their own records) · public/anon (reads catalogue + open slots; orders via RPC only). Rename `staff` → `driver`/`packer` per client.

```sql
-- user_profiles + role plumbing
CREATE TABLE IF NOT EXISTS user_profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  full_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-create a profile for every new auth user (least privilege).
-- NULL-SAFE: the COALESCE + ON CONFLICT is the fix for the JG Foods
-- signup-trigger bug that fired when raw_user_meta_data was null.
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_user_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();

-- Role helper used throughout RLS. SECURITY DEFINER + STABLE.
-- Fail-safe: unknown user => least privilege ('staff').
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE((SELECT role FROM user_profiles WHERE id = auth.uid()), 'staff');
$$;
```

Every policy keys off `current_user_role()`. Representative policies (full set across products, delivery_slots, customers, orders, order_items, invoices, app_settings):

```sql
-- products — public reads available; staff reads all; admin writes
CREATE POLICY "Public read available products" ON products FOR SELECT USING (is_available = true);
CREATE POLICY "Staff read all products"        ON products FOR SELECT USING (current_user_role() IN ('admin','staff'));
CREATE POLICY "Admin write products"           ON products FOR ALL
  USING (current_user_role() = 'admin') WITH CHECK (current_user_role() = 'admin');

-- orders — admin full; staff read + update status; account reads own
CREATE POLICY "Admin manage orders"       ON orders FOR ALL
  USING (current_user_role() = 'admin') WITH CHECK (current_user_role() = 'admin');
CREATE POLICY "Staff read orders"         ON orders FOR SELECT USING (current_user_role() = 'staff');
CREATE POLICY "Staff update order status" ON orders FOR UPDATE
  USING (current_user_role() = 'staff') WITH CHECK (current_user_role() = 'staff');
CREATE POLICY "Account read own orders"   ON orders FOR SELECT
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- FINANCIAL TABLES — admin ONLY (staff blocked at the DB level, not just hidden in UI)
CREATE POLICY "Admin only invoices"       ON invoices FOR ALL
  USING (current_user_role() = 'admin') WITH CHECK (current_user_role() = 'admin');
CREATE POLICY "Account read own invoices" ON invoices FOR SELECT
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
```

After running migrations, promote the owner once:

```sql
UPDATE user_profiles SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'owner@example.com');  -- >>> CUSTOMISE
```

### 9.2 Triggers to bake into the base schema

**Slot `orders_count` must handle order *moves* between slots** (`UPDATE OF status, delivery_slot_id`), not just insert/cancel. Missing the move case was a JG Foods production bug fix.

```sql
CREATE OR REPLACE FUNCTION update_slot_orders_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'cancelled' THEN
    UPDATE delivery_slots SET orders_count = orders_count + 1 WHERE id = NEW.delivery_slot_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status <> 'cancelled' THEN
    UPDATE delivery_slots SET orders_count = orders_count - 1 WHERE id = OLD.delivery_slot_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.delivery_slot_id <> OLD.delivery_slot_id THEN          -- moved to a different slot
      IF OLD.status <> 'cancelled' THEN
        UPDATE delivery_slots SET orders_count = orders_count - 1 WHERE id = OLD.delivery_slot_id;
      END IF;
      IF NEW.status <> 'cancelled' THEN
        UPDATE delivery_slots SET orders_count = orders_count + 1 WHERE id = NEW.delivery_slot_id;
      END IF;
    ELSIF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
      UPDATE delivery_slots SET orders_count = orders_count - 1 WHERE id = NEW.delivery_slot_id;
    ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
      UPDATE delivery_slots SET orders_count = orders_count + 1 WHERE id = NEW.delivery_slot_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_slot_orders_count
AFTER INSERT OR UPDATE OF status, delivery_slot_id OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION update_slot_orders_count();
```

Order total auto-recalc (so totals can never drift) and an `updated_at` trigger go on every table — see `set_updated_at()` in §4. (This is the canonical order-total trigger; prefer it over the simpler one in §6.)

### 9.3 `place_order` RPC — orders without table access

The public website calls one `SECURITY DEFINER` RPC instead of getting insert access to `orders`/`customers`. It enforces slot capacity and cut-off **server-side** — never trust the browser for this.

```sql
CREATE OR REPLACE FUNCTION place_order(
  p_name text, p_email text, p_phone text, p_address text, p_postcode text,
  p_slot_id uuid,
  p_items jsonb,            -- [{product_id, product_name, unit_price, quantity, unit}]
  p_customer_type text DEFAULT 'domestic',
  p_channel text DEFAULT 'website',
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid; v_order_id uuid; v_slot record; v_item jsonb; v_ref text;
BEGIN
  SELECT * INTO v_slot FROM delivery_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Delivery slot not found'); END IF;
  IF NOT v_slot.is_open THEN RETURN jsonb_build_object('error','Sorry, this delivery slot is now closed'); END IF;
  IF v_slot.cutoff_at IS NOT NULL AND now() > v_slot.cutoff_at THEN
    RETURN jsonb_build_object('error','The order cut-off for this slot has passed'); END IF;
  IF v_slot.orders_count >= v_slot.capacity THEN
    RETURN jsonb_build_object('error','Sorry, this delivery slot is fully booked'); END IF;

  SELECT id INTO v_customer_id FROM customers
   WHERE (email = p_email AND p_email IS NOT NULL AND p_email <> '')
      OR (phone = p_phone AND p_phone IS NOT NULL AND p_phone <> '') LIMIT 1;
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (name, email, phone, address_line_1, postcode, customer_type)
    VALUES (p_name, p_email, p_phone, p_address, p_postcode, p_customer_type)
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO orders (customer_id, delivery_slot_id, channel, status, notes)
  VALUES (v_customer_id, p_slot_id, p_channel, 'pending', p_notes) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, unit)
    VALUES (v_order_id, NULLIF(v_item->>'product_id','')::uuid, v_item->>'product_name',
            (v_item->>'unit_price')::numeric, (v_item->>'quantity')::integer,
            COALESCE(v_item->>'unit','each'));
  END LOOP;

  v_ref := 'ORD-' || upper(substring(v_order_id::text, 1, 6));   -- >>> CUSTOMISE prefix per client
  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'reference', v_ref,
                            'slot_date', v_slot.delivery_date, 'slot_day', v_slot.day_label);
END;
$$;

GRANT EXECUTE ON FUNCTION place_order TO anon;
```

### 9.4 `app_settings` key/value table — no config in code

Client-tweakable config (cut-off times, fees, capacities, copy) lives here, not in code constants — avoids a migration + redeploy every time a number changes.

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: authenticated reads, admin writes.
CREATE POLICY "Auth read settings"   ON app_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin write settings" ON app_settings FOR ALL
  USING (current_user_role() = 'admin') WITH CHECK (current_user_role() = 'admin');
```

### 9.5 Price snapshots — never join live prices to historical orders

`order_items` stores `product_name` and `unit_price` **at time of order**. Render historical orders from those snapshots; never join live `products` — prices change.

### 9.6 Self-service user management (service-role Netlify function)

So the client adds/removes their own staff logins and resets passwords without you touching Supabase. The Supabase **service-role key lives server-side only**; every request carries the caller's token and the function verifies the caller is `admin` before acting. Actions: `list`, `create`, `setRole`, `resetPassword`, `delete`.

```javascript
// netlify-functions/manage-users.js — admin-gated; service key server-side only
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;  // Netlify env var, never in browser
const DEFAULT_ROLE = 'staff';                                // least privilege

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!SERVICE_KEY || !SUPABASE_URL) return json(503, { error: 'User management not configured.' });

  const token = (event.headers.authorization || event.headers.Authorization || '')
    .replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'Not signed in' });

  let caller;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${token}` } });
    if (!r.ok) return json(401, { error: 'Invalid session' });
    caller = await r.json();
  } catch { return json(401, { error: 'Invalid session' }); }

  if ((await getRole(caller.id)) !== 'admin') return json(403, { error: 'Admins only' });

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  try {
    switch (body.action) {
      case 'list':          return json(200, { users: await listUsers() });
      case 'create':        return json(200, await createUser(body));
      case 'setRole':       return json(200, await setRole(body.userId, body.role));
      case 'resetPassword': return json(200, await adminUpdate(body.userId, { password: body.password }));
      case 'delete':
        if (body.userId === caller.id) return json(400, { error: "You can't delete your own login." });
        return json(200, await deleteUser(body.userId));
      default: return json(400, { error: 'Unknown action' });
    }
  } catch (err) { console.error('manage-users error', err); return json(502, { error: err.message || 'Request failed' }); }
};
// (helper fns getRole/listUsers/createUser/setRole/adminUpdate/deleteUser/json use the Supabase
//  admin REST + auth/v1/admin endpoints with the service key — full implementation in the starter kit.)
```

> **Reference implementations:** the complete files live in the AXRIK starter kit —
> `supabase/001_base_schema.sql`, `002_roles_and_rls.sql`, `003_place_order_rpc.sql`,
> and `netlify-functions/manage-users.js`.

---

## Quick Reference: When to Use What

| Need | Approach |
|---|---|
| Restrict who sees what data | RLS policies |
| Role-based access from day one | `current_user_role()` helper + per-role policies (§9.1) |
| Public website placing orders | `place_order` SECURITY DEFINER RPC (§9.3) |
| Client-tweakable config | `app_settings` key/value table (§9.4) |
| Client manages their own staff logins | `manage-users` service-role Netlify function (§9.6) |
| Show/hide UI based on role | Client-side role check (cosmetic only) |
| Auto-calculate a value | Postgres trigger or GENERATED column |
| Track data changes | Audit trigger |
| Send emails or call APIs | Edge Function or EmailJS from client |
| Real-time updates | Supabase Realtime subscription |
| Complex data queries | Postgres functions callable via `.rpc()` |
| File uploads | Supabase Storage with RLS on buckets |
