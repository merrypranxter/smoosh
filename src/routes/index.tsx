import { createFileRoute } from "@tanstack/react-router";
import { SmooshApp } from "@/smoosh/ui/SmooshApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SmooshApp />;
}
