import { Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/Toast";
import { RecipifyApp } from "@/components/RecipifyApp";
import { SuccessPage } from "@/pages/SuccessPage";

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/*" element={<RecipifyApp />} />
      </Routes>
    </ToastProvider>
  );
}
