/**
 * Prefer IPv4 when resolving hostnames. Railway (and some hosts) can resolve
 * Supabase to IPv6 and then fail with ENETUNREACH; forcing IPv4 fixes the connection.
 */
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
