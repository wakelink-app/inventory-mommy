import { redirect } from "next/navigation";

export default function OrderItemRedirect() {
  redirect("/orders");
}
