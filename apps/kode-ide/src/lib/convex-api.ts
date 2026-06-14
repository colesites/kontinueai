import { anyApi, type FunctionReference } from "convex/server";

type CurrentUser = {
  _id: string;
  clerkUserId: string;
  email: string;
  name?: string;
  imageUrl?: string;
  subscriptionStatus?: string;
  plan?: string;
} | null;

type GetOrCreateUserArgs = {
  clerkUserId: string;
  email: string;
  name?: string;
  imageUrl?: string;
  subscriptionStatus?: string;
  plan?: string;
};

type KodeConvexApi = {
  users: {
    getCurrentUser: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      CurrentUser
    >;
    getOrCreateUser: FunctionReference<
      "mutation",
      "public",
      GetOrCreateUserArgs,
      string
    >;
  };
};

export const api = anyApi as unknown as KodeConvexApi;
