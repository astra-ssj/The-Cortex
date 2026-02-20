import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ComplianceDashboard } from "./ComplianceDashboard";
import { FrameworkDetailPage } from "./FrameworkDetailPage";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
          <Link to="/" className="text-xl font-semibold text-slate-800 hover:text-slate-600">
            CORTEX Compliance
          </Link>
        </header>
        <main className="p-6">
          <Routes>
            <Route path="/" element={<ComplianceDashboard />} />
            <Route path="/frameworks/:id" element={<FrameworkDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
