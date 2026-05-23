import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="w-full max-w-6xl mx-auto px-6 py-8 mt-auto text-[#6B7785] text-xs border-t border-brand-teal/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="space-y-1 text-left">
        <p>© 2026 Travlly. All rights reserved.</p>
        <Link to="/privacy" className="inline-block hover:text-brand-coral hover:underline transition-colors font-medium">
          Privacy Policy
        </Link>
      </div>
      <div className="text-left sm:text-right font-bold tracking-widest text-[#6B7785]/60 pr-2">
        v1.6
      </div>
    </footer>
  );
}
