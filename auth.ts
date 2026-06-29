import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens, conversations, cartItems, wishlistItems, savedAddresses } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

declare module "next-auth" {
  interface Session {
    user: { id: string; isAnonymous: boolean } & DefaultSession["user"];
  }
  interface User {
    isAnonymous?: boolean;
  }
}

export async function migrateAnonymousData(anonId: string, googleId: string) {
  if (!anonId || !googleId || anonId === googleId) return;
  await db.transaction(async (tx) => {
    await tx.update(conversations).set({ userId: googleId }).where(eq(conversations.userId, anonId));
    const anonCart = await tx.select().from(cartItems).where(eq(cartItems.userId, anonId));
    for (const item of anonCart) {
      const whereClause = item.variantId
        ? and(eq(cartItems.userId, googleId), eq(cartItems.productId, item.productId), eq(cartItems.variantId, item.variantId))
        : and(eq(cartItems.userId, googleId), eq(cartItems.productId, item.productId), isNull(cartItems.variantId));
      const [existing] = await tx.select().from(cartItems).where(whereClause).limit(1);
      if (existing) {
        if (item.quantity > existing.quantity) {
          await tx.update(cartItems).set({ quantity: item.quantity }).where(eq(cartItems.id, existing.id));
        }
        await tx.delete(cartItems).where(eq(cartItems.id, item.id));
      } else {
        await tx.update(cartItems).set({ userId: googleId }).where(eq(cartItems.id, item.id));
      }
    }
    await tx.update(wishlistItems).set({ userId: googleId }).where(eq(wishlistItems.userId, anonId));
    await tx.update(savedAddresses).set({ userId: googleId }).where(eq(savedAddresses.userId, anonId));
    await tx.delete(users).where(eq(users.id, anonId));
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT strategy (not database): the guest Credentials provider can only issue a
  // JWT session token, and a database-strategy resolver can't read it — server-side
  // auth() would return null for guests, 401-ing every guest API call. With jwt the
  // DrizzleAdapter still persists users/accounts (so FKs + anon→Google migration work)
  // while both Google and guest sessions resolve from the signed token.
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {},
      authorize: async () => {
        const id = crypto.randomUUID();
        const [user] = await db.insert(users).values({ id, isAnonymous: true }).returning();
        return user;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.id) {
        const { cookies } = await import("next/headers");
        const store = await cookies();
        const anonId = store.get("_ruki_anon")?.value;
        if (anonId) {
          await migrateAnonymousData(anonId, user.id);
          store.delete("_ruki_anon");
        }
      }
      return true;
    },
    // NOTE: next-auth@5.0.0-beta.31 routes Credentials through JWT regardless of session.strategy.
    // Google OAuth uses the database adapter; guest uses JWT-backed session cookie.
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.isAnonymous = (user as { isAnonymous?: boolean }).isAnonymous ?? false;
      }
      return token;
    },
    session({ session, user, token }) {
      if (user) {
        return { ...session, user: { ...session.user, id: user.id, isAnonymous: (user as { isAnonymous?: boolean }).isAnonymous ?? false } };
      }
      return { ...session, user: { ...session.user, id: token.sub ?? "", isAnonymous: (token.isAnonymous as boolean) ?? false } };
    },
  },
});
