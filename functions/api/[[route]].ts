import { handle } from "hono/cloudflare-pages";
import app from "../lib/app";

export const onRequest = handle(app);
