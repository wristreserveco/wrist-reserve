"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PayPalScriptProvider,
  PayPalButtons,
  FUNDING,
  type ReactPayPalScriptOptions,
} from "@paypal/react-paypal-js";
import type { ShippingAddress } from "./ShippingAddressForm";

interface Props {
  productId: string;
  quantity: number;
  /** When set, passed to `sdk-create` as SET_PROVIDED_ADDRESS (optional). */
  shipping?: ShippingAddress;
  /** Optional hook after capture, before redirect to tracking. */
  onPaid?: (internalOrderId: string) => void;
  onCancel?: () => void;
  onError?: (msg: string) => void;
  height?: number;
  disabled?: boolean;
}

/**
 * Three **standalone** Smart Buttons in a fixed vertical order:
 * **Debit / credit (card)** → **PayPal** → **Venmo** (Venmo only renders when
 * PayPal marks the device eligible — same as PayPal’s own rules).
 *
 * This is the only reliable way to put **card above** the yellow PayPal button;
 * PayPal’s single-stack order is not controllable from our side.
 *
 * Apple Pay, Pay Later, and legacy “credit” stay disabled.
 */
export function PayPalCheckoutButtons({
  productId,
  quantity,
  shipping,
  onPaid,
  onCancel,
  onError,
  height = 45,
  disabled,
}: Props) {
  const router = useRouter();
  const [bootError, setBootError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  const scriptOptions = useMemo<ReactPayPalScriptOptions>(
    () => ({
      clientId: clientId ?? "missing",
      currency: "USD",
      intent: "capture",
      components: "buttons",
      "enable-funding": "card,venmo",
      "disable-funding": "credit,applepay,paylater",
    }),
    [clientId]
  );

  const createOrder = useCallback(async () => {
    const res = await fetch("/api/checkout/paypal/sdk-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity, shipping }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };
    if (!res.ok || !data.id) {
      const msg = data.error || `Couldn't start PayPal (HTTP ${res.status}).`;
      onError?.(msg);
      throw new Error(msg);
    }
    return data.id;
  }, [productId, quantity, shipping, onError]);

  const onApprove = useCallback(
    async (data: { orderID: string }) => {
      const postCapture = async () => {
        const res = await fetch("/api/checkout/paypal/sdk-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paypalOrderId: data.orderID }),
        });
        const result = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          orderId?: string;
          error?: string;
          alreadyPaid?: boolean;
        };
        return { res, result };
      };

      let { res, result } = await postCapture();
      if (
        (!res.ok || !result.ok || !result.orderId) &&
        (res.status === 402 || res.status === 502 || res.status === 503)
      ) {
        await new Promise((r) => setTimeout(r, 900));
        ({ res, result } = await postCapture());
      }

      if (!res.ok || !result.ok || !result.orderId) {
        const msg =
          result.error ||
          "Payment approved but capture failed. Contact support — your order is preserved.";
        onError?.(msg);
        throw new Error(msg);
      }

      onPaid?.(result.orderId);
      router.push(`/checkout/pending/${result.orderId}?paid=1`);
    },
    [onError, onPaid, router]
  );

  const onErrorCb = useCallback(
    (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong with PayPal. Try again or use crypto.";
      onError?.(msg);
    },
    [onError]
  );

  useEffect(() => {
    if (!clientId) {
      setBootError(
        "PayPal isn't configured for this site yet. Try crypto, or contact support."
      );
    }
  }, [clientId]);

  if (!clientId) {
    return (
      <div className="rounded-sm border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-200">
        {bootError}
      </div>
    );
  }

  const shared = {
    disabled,
    createOrder,
    onApprove,
    onCancel: () => onCancel?.(),
    onError: onErrorCb,
  };

  const stackStyle = {
    layout: "vertical" as const,
    shape: "rect" as const,
    tagline: false,
    height,
    label: "buynow" as const,
  };

  return (
    <div className={`space-y-2 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <PayPalScriptProvider options={scriptOptions}>
        <PayPalButtons
          fundingSource={FUNDING.CARD}
          {...shared}
          style={{ ...stackStyle, color: "black" }}
        />
        <PayPalButtons
          fundingSource={FUNDING.PAYPAL}
          {...shared}
          style={{ ...stackStyle, color: "gold" }}
        />
        <PayPalButtons
          fundingSource={FUNDING.VENMO}
          {...shared}
          style={{ ...stackStyle, color: "blue" }}
        />
      </PayPalScriptProvider>
    </div>
  );
}
