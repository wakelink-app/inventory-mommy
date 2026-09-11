import { redirect } from "next/navigation";

export default function SoldRedirect() {
  redirect("/orders");
}
