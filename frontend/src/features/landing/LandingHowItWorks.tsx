export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24 bg-surface-2 text-ink-900 border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-100 border border-blue-200 px-3 py-1 rounded-pill mb-3 inline-block">
            Simple 3-Step Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl font-heading font-extrabold tracking-tight text-ink-900 mb-4">
            How it works
          </h2>
          <p className="text-base sm:text-lg text-ink-600">
            From creation to automated settlement in three frictionless steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Step 1: Create */}
          <div className="bg-surface border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-2xl font-extrabold font-heading text-blue-700">01</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-pill bg-blue-100 text-blue-800 border border-blue-200">
                  Step 1
                </span>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-3">Create</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Enter client details, select ETB or USD, and add dynamic line items. Totals and taxes compute with integer precision on the server.
              </p>
            </div>
            {/* CSS/SVG Illustration */}
            <div className="bg-surface-2 border border-line rounded-md p-4 flex items-center justify-center">
              <svg className="w-12 h-12 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
          </div>

          {/* Step 2: Share */}
          <div className="bg-surface border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-2xl font-extrabold font-heading text-blue-700">02</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-pill bg-blue-100 text-blue-800 border border-blue-200">
                  Step 2
                </span>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-3">Share</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Assign a gapless sequential invoice number and share an unguessable 32-byte public link or download a crisp PDF invoice.
              </p>
            </div>
            {/* CSS/SVG Illustration */}
            <div className="bg-surface-2 border border-line rounded-md p-4 flex items-center justify-center">
              <svg className="w-12 h-12 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
          </div>

          {/* Step 3: Get paid */}
          <div className="bg-surface border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-2xl font-extrabold font-heading text-blue-700">03</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-pill bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Step 3
                </span>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-3">Get paid</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Clients settle online via Chapa or simulated checkout. Verified webhooks update your invoice and dashboard automatically.
              </p>
            </div>
            {/* CSS/SVG Illustration */}
            <div className="bg-surface-2 border border-line rounded-md p-4 flex items-center justify-center">
              <svg className="w-12 h-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
