import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AnimateUIProvider } from "@animate-ui/react/provider"

import { TooltipProvider } from "@/components/ui/tooltip"

import App from "./App.tsx"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AnimateUIProvider tempo={0.9}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </AnimateUIProvider>
  </StrictMode>,
)
