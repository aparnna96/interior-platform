# Confident Group: Interior Platform Demo Guide

**Demo environment: payments and pricing are simulated.** No real money is charged, and the prices shown are demo figures that the design team confirms.

- **Site:** https://interior-platform-sigma.vercel.app
- **Brand:** Confident Group

| Role | Email | Password |
| --- | --- | --- |
| Customer | demo.customer@confidentgroup.example | provided separately |
| Admin | demo.admin@confidentgroup.example | provided separately |
| Field Staff | demo.fieldstaff@confidentgroup.example | provided separately |

The demo accounts already hold sample orders, proposals and enquiries, so every screen has something to show. Use the **customer** login for steps 1 to 9 and the **admin** login for step 10. The **Field Staff** login is for the short team-access demo at the end.

## Customer demo (about 10 minutes)

**Home → Interiors → Furniture → Product → Visualizer → Estimate → Proposal → Demo Payment → PDF → Admin**

| # | Step | What to show |
| --- | --- | --- |
| 1 | **Home** | The brand story and featured furniture. Point out that the top menu reaches every area. |
| 2 | **Interiors** | The room showcase (living room, bedroom, home office). Choose **Talk to us** to show the enquiry form: name, phone and requirement are required, and a bad email is flagged. Submitting creates a lead the team sees in the admin side. |
| 3 | **Furniture** | Browse the catalogue, filter by room, and search by name. Add a piece to the cart; the cart count updates in the menu. |
| 4 | **Product** | Open any product for its details and specifications. Set a quantity, then choose **Add to Cart** or **Add to Visualizer**. Each product page has its own link that can be shared. |
| 5 | **Visualizer** | Enter room dimensions (4 to 50 ft) and choose **Generate Room**. Pieces appear to scale: place a sofa, bed, table, chair or wardrobe, select one, and move it with the position controls. Switch wall, floor, fabric and lighting finishes, and toggle between the 2D plan and the perspective view. |
| 6 | **Estimate** | Area and amount update from the room size (area × the current rate, which an Admin sets under **Estimate rate**). Choose **Save Estimate**. The pieces placed in the Visualizer are saved with it. The sample customer already has saved estimates. |
| 7 | **Proposal** | In **Saved estimates**, choose **Create Proposal**. The proposal copies the room size, the amount and the furniture from that estimate (the shopping cart is not used). Furniture lines show as "To be quoted". |
| 8 | **Demo Payment** | Open the unpaid proposal (₹1,80,000: bed and wardrobe). Choose **Pay Token**, then **Confirm demo payment**. The page shows "Payment verified", and no card is involved. |
| 9 | **PDF** | **Download PDF** is locked ("PDF available after token payment") until the payment is confirmed. After confirming, download the branded proposal. The sample paid proposal (₹2,52,000) already has its PDF ready. |
| 10 | **Admin** | See the admin demo below. |

Also worth a quick look in the customer area:
- **Cart and Orders:** place an order from the cart and watch it appear in Orders with its status.
- **Account:** shows who is signed in and links to orders, proposals and estimates. **Log out** returns to the home page.

## Admin demo (about 5 minutes)

Log out, then log in as the admin, or open `/login` in a private window. The admin lands on the **Dashboard** (`/admin`), inside a separate Admin workspace with its own sidebar and header. The customer menus are replaced here, and the header shows an **Admin** badge with the signed-in email.

The Admin sidebar has three groups:

- **Overview:** **Dashboard**.
- **Manage:** **Products**, **Orders**, **Proposals**, **Leads** and **Estimate rate**.
- **Site:** **View customer site**, **Account** and **Log out**.

On a phone the sidebar becomes a drawer: open it with the menu button at the top left, and close it with the **X** button, by tapping outside it, or with the Escape key. From the customer site, the **Admin** link at the end of the top menu returns to the dashboard. It is shown to admins only.

1. **Dashboard:** five summary cards (orders, new leads, proposals, products and the current estimate rate), the newest few orders, leads and proposals under **Recent activity**, and **Quick actions** that jump to each management page.
2. **Orders:** every customer's orders with their status and totals. Open a **Pending** order (the sample customer has one; to add another, place an order from the customer side: add a piece to the cart, then **Place Order**) and move it along: **Confirm order**, then **Start processing**, then **Mark completed**. Only valid next steps are offered, and **Cancel order** asks for a second click. Completed and cancelled orders are final. The customer sees each status change in their own Orders page.
3. **Proposals:** every proposal with its payment state ("Token payment verified" or "No payment attempt"). Open one to see the room details, furniture lines and payment record.
4. **Leads:** the enquiries submitted through the site, filterable as New, In Progress and Closed. Open one to update its status.
5. **Products:** the catalogue (eight pieces). Edit a price or description, or deactivate a product. A deactivated product disappears from the public store immediately.
6. **Estimate rate:** the price per square foot used for new estimates. Setting a new rate changes the amount on estimates created afterwards.

## Field Staff demo (about 2 minutes)

Log out, then log in as the Field Staff user. It lands on **Leads**.

- **Access:** Leads.
- **Demonstrates:** viewing the enquiries submitted through the site, and updating a lead's status (New, In Progress, Closed).
- The Admin pages (Dashboard, Products, Orders, Proposals and Estimate rate) are not available to this role, and Field Staff do not get the Admin workspace. Opening one of those addresses returns the user to Leads.

## Notes

- **Simulated payments:** the token payment uses a demo confirmation step in place of a payment provider. The proposal PDF unlocks only after a payment is recorded as verified.
- **Pricing:** area rates and product prices are demo figures.
- **WhatsApp:** the "Continue on WhatsApp" option is hidden until the official Confident Group WhatsApp number is provided. Enquiries are still saved and visible under Leads.
- **Projects:** the Projects list keeps saved room setups for the current browser session.
- **Phones:** the whole flow works on a phone; the menu opens from the button at the top left.
