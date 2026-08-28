"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/Logo";

export function Header() {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="hover:opacity-80 transition-opacity min-w-0"
            >
              <Logo showTagline size={36} />
            </Link>
            <div className="flex items-center gap-4 shrink-0">
              <button
                onClick={() => setShowAbout(true)}
                className="p-2 rounded-full hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="About"
              >
                <Info size={20} className="text-[var(--muted)]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="max-w-lg w-full bg-[var(--surface)] rounded-2xl p-6 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-2xl font-bold mb-4"
              style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}
            >
              <span className="text-[var(--brand-navy)]">About Menu</span>
              <span className="text-[var(--brand-green)]">Truth</span>
            </h2>
            <div className="space-y-4 text-[var(--foreground)]">
              <p>
                Have you noticed that food delivery apps charge more per item
                than if you ordered directly from the restaurant?{" "}
                <strong>It&apos;s not just the delivery fee</strong> — many
                items are marked up 15-30% on the app.
              </p>
              <p>
                <strong>MenuTruth</strong> helps you see which restaurants have
                markups on delivery apps, and shows you how to order directly to
                save money.
              </p>
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-emerald-800 dark:text-emerald-200 font-medium">
                  Tip: Restaurants with &quot;Direct Delivery&quot; let you
                  order through their own website or by phone — same food, lower
                  prices!
                </p>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Prices are verified regularly but may change — help us by
                flagging outdated info!
              </p>
            </div>
            <button
              onClick={() => setShowAbout(false)}
              className="mt-6 w-full py-3 rounded-xl bg-[var(--brand-green)] text-white font-medium hover:opacity-90 transition-opacity"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
