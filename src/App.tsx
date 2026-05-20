/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./components/LandingPage";
import TripFormPage from "./components/TripFormPage";
import TripDetailsPage from "./components/TripDetailsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/trip/create" element={<TripFormPage />} />
        <Route path="/trip/:shareToken" element={<TripDetailsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
