import type { AnchorHTMLAttributes } from "react";
const router = {
  refresh() {},
  push(href: string) {
    document.body.dataset.navigation = href;
  },
  replace(href: string) {
    document.body.dataset.navigation = href;
  },
  prefetch() {},
  back() {},
  forward() {},
};
export function useRouter() {
  return router;
}
export function redirect() {
  throw new Error("Unexpected fixture redirect");
}
export function notFound() {
  throw new Error("Unexpected fixture not-found");
}
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
