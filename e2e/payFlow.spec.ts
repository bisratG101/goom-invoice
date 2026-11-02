import { test, expect } from '@playwright/test';

test.describe('End-to-End Payment Smoke Flow', () => {
  test('owner creates client and invoice, payer pays via simulator, owner dashboard reflects payment', async ({
    page,
    browser,
  }) => {
    const timestamp = Date.now();
    const ownerName = `Smoke Owner ${timestamp}`;
    const ownerEmail = `smoke_${timestamp}@example.com`;
    const ownerPassword = 'Password123!';
    const businessName = `Smoke Ventures ${timestamp}`;
    const clientName = `Acme Client ${timestamp}`;
    const clientEmail = `acme_${timestamp}@example.com`;

    // ==========================================
    // 1. Authenticate as an owner (Register)
    // ==========================================
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();

    await page.getByLabel('Your full name').fill(ownerName);
    await page.getByLabel('Email address').fill(ownerEmail);
    await page.getByLabel(/Password/i).fill(ownerPassword);
    await page.getByLabel(/Business/i).fill(businessName);

    await page.getByRole('button', { name: /Create free account/i }).click();

    // Verify redirect to owner dashboard
    await page.waitForURL('**/app');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();

    // ==========================================
    // 2. Create a client via UI
    // ==========================================
    await page.goto('/app/clients');
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();

    // Click "Add client" or "Add your first client"
    const addClientButton = page.getByRole('button', { name: /Add client|Add your first client/i }).first();
    await addClientButton.click();

    // Drawer form opens
    const clientNameInput = page.getByLabel('Client Name');
    await expect(clientNameInput).toBeVisible();
    await clientNameInput.fill(clientName);
    await page.getByLabel('Email Address').fill(clientEmail);
    await page.getByLabel('Phone Number').fill('+251911000000');
    await page.getByLabel('Billing Address').fill('Addis Ababa, Ethiopia');

    await page.getByRole('button', { name: /Create Client/i }).click();

    // Verify client appears in the client list
    await expect(page.getByText(clientName).first()).toBeVisible();

    // ==========================================
    // 3. Create and send an invoice
    // ==========================================
    await page.goto('/app/invoices/new');
    await expect(page.getByRole('heading', { name: /New Invoice/i })).toBeVisible();

    // Wait for the client to be loaded in the dropdown options, then select it
    const clientOption = page.locator('#client-select option', { hasText: clientName });
    await expect(clientOption).toBeAttached({ timeout: 10000 });
    const optionValue = await clientOption.getAttribute('value');
    expect(optionValue).toBeTruthy();
    await page.locator('#client-select').selectOption(optionValue!);

    // Fill line item details
    await page.getByLabel('Item 1 description').fill('Quarterly Technical Consulting');
    await page.getByLabel('Item 1 unit price').fill('8500');

    // Save as draft
    const saveDraftBtn = page.getByRole('button', { name: /Save as draft/i });
    await saveDraftBtn.click();

    // Wait for invoice detail page
    await page.waitForURL(/\/app\/invoices\/[a-f0-9-]+$/);
    const invoiceDetailUrl = page.url();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    // Send the invoice
    await page.getByRole('button', { name: /Send invoice/i }).click();

    // Confirm dialog
    const confirmSendBtn = page.getByRole('button', { name: /Confirm & Send/i });
    await expect(confirmSendBtn).toBeVisible();
    await confirmSendBtn.click();

    // Verify status becomes "Sent"
    await expect(page.getByText('Sent', { exact: true })).toBeVisible();

    // Retrieve the public invoice link from the UI
    const publicUrlInput = page.locator('input[readonly]');
    await expect(publicUrlInput).toBeVisible();
    const publicUrl = await publicUrlInput.inputValue();
    expect(publicUrl).toContain('/i/');

    // ==========================================
    // 4. Open public invoice link in payer context
    // ==========================================
    const payerContext = await browser.newContext();
    const payerPage = await payerContext.newPage();

    await payerPage.goto(publicUrl);
    await expect(payerPage.getByText(businessName)).toBeVisible();
    await expect(payerPage.getByText('Quarterly Technical Consulting')).toBeVisible();
    await expect(payerPage.getByText(/8,500\.00/).first()).toBeVisible();

    // Verify status chip is "Sent" on the public page
    await expect(payerPage.getByText('Sent', { exact: true }).first()).toBeVisible();

    // ==========================================
    // 5. Initiate simulated payment
    // ==========================================
    const payDemoButton = payerPage.getByRole('button', { name: /Pay \(demo\)/i });
    await expect(payDemoButton).toBeVisible();
    await payDemoButton.click();

    // Verify navigation to simulated gateway
    await payerPage.waitForURL(/\/pay\/simulated\/[a-zA-Z0-9_-]+/);
    await expect(payerPage.getByText(/DEMO MODE — Simulated Payment Gateway/i)).toBeVisible();
    await expect(payerPage.getByRole('heading', { name: /Simulated Checkout/i })).toBeVisible();

    // ==========================================
    // 6. Confirm payment in simulated gateway
    // ==========================================
    const confirmPayButton = payerPage.getByRole('button', { name: /Pay \(demo\)/i });
    await expect(confirmPayButton).toBeVisible();
    await confirmPayButton.click();

    // ==========================================
    // 7. Verify return page displays confirmation
    // ==========================================
    await payerPage.waitForURL(/\/i\/[a-zA-Z0-9_-]+\/return/);

    // Wait for polling to succeed and show "Payment confirmed"
    const confirmedHeading = payerPage.getByRole('heading', { name: /Payment confirmed/i });
    await expect(confirmedHeading).toBeVisible({ timeout: 15000 });

    // Assert Paid status chip is visible on the return page
    await expect(payerPage.getByText('Paid', { exact: true }).first()).toBeVisible();
    await expect(payerPage.getByText(/8,500\.00/).first()).toBeVisible();

    // Close the payer browser context
    await payerContext.close();

    // ==========================================
    // 8. Verify owner dashboard reflects payment
    // ==========================================
    await page.goto('/app');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();

    // Verify recent activity shows the paid event
    await expect(page.getByText(clientName).first()).toBeVisible();
    await expect(page.getByText(/paid/i).first()).toBeVisible();

    // Verify invoice detail page reflects the paid status
    await page.goto(invoiceDetailUrl);
    await expect(page.getByText(/Payment confirmed\./i)).toBeVisible();
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  });
});
