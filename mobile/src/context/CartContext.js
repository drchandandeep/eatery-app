// context/CartContext.js
// Cart lines are kept client-side until checkout, then submitted to the
// backend in one shot. Each line carries a snapshot of chosen options so
// price changes to the menu later don't retroactively affect a live cart.
import React, { createContext, useContext, useMemo, useState } from 'react';

const CartContext = createContext(null);

function lineKey(menuItemId, selectedOptions) {
  return `${menuItemId}::${JSON.stringify(selectedOptions.map((o) => o.choice_id).sort())}`;
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]); // { key, menu_item_id, name, unit_price, quantity, selected_options }

  function addItem({ menu_item_id, name, base_price, selected_options = [] }) {
    const optionsDelta = selected_options.reduce((s, o) => s + (o.price_delta || 0), 0);
    const unit_price = base_price + optionsDelta;
    const key = lineKey(menu_item_id, selected_options);

    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { key, menu_item_id, name, unit_price, quantity: 1, selected_options }];
    });
  }

  function updateQuantity(key, quantity) {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  }

  function removeItem(key) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function clearCart() {
    setLines([]);
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.quantity, 0), [lines]);
  const itemCount = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  return (
    <CartContext.Provider
      value={{ lines, addItem, updateQuantity, removeItem, clearCart, subtotal, itemCount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
