/**
 * Firebase Functions for Sporcle League
 * Handles Stripe payment processing for gems and premium passes
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe");

admin.initializeApp();

// Hardcode for testing - REMOVE AFTER CONFIRMING IT WORKS
// Replace with your actual test key for testing, or live key for production
const STRIPE_KEY =
  "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";

// Product configurations
const PRODUCTS = {
  gems100: {
    gems: 100,
    priceInCents: 99,
    name: "100 Gems - Starter Pack",
  },
  gems550: {
    gems: 550,
    priceInCents: 499,
    name: "550 Gems - Best Value",
  },
  gems1200: {
    gems: 1200,
    priceInCents: 999,
    name: "1200 Gems - Premium Bundle",
  },
  premium: {
    priceInCents: 199,
    name: "Season 3 Premium Pass",
  },
};

/**
 * Lazy initialization of Stripe client
 */
function getStripeClient() {
  // Use hardcoded key for now - will switch back to config after testing
  if (!STRIPE_KEY) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Stripe is not configured."
    );
  }
  return stripe(STRIPE_KEY);
}

/**
 * Create a Stripe Checkout Session
 * Called from the frontend when user wants to purchase gems or premium
 */
exports.createStripeCheckoutSession = functions.https.onCall(
  async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be signed in to make purchases."
      );
    }

    const userId = context.auth.uid;
    const { gems, priceInCents, product, successUrl, cancelUrl } = data;

    // Get Stripe client (lazy initialization)
    const stripeClient = getStripeClient();

    try {
      let lineItems = [];
      let metadata = { userId: userId };

      if (product === "premium") {
        // Premium pass purchase
        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: PRODUCTS.premium.name,
                description: "Unlock all premium rewards for Season 3",
              },
              unit_amount: PRODUCTS.premium.priceInCents,
            },
            quantity: 1,
          },
        ];
        metadata.type = "premium";
      } else if (gems && priceInCents) {
        // Gems purchase
        const productKey = `gems${gems}`;
        const productInfo = PRODUCTS[productKey] || {
          gems: gems,
          priceInCents: parseInt(priceInCents),
          name: `${gems} Gems`,
        };

        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: productInfo.name,
                description: `${gems} gems for your Sporcle League account`,
              },
              unit_amount: productInfo.priceInCents,
            },
            quantity: 1,
          },
        ];
        metadata.type = "gems";
        metadata.gems = gems.toString();
      } else {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid purchase request"
        );
      }

      // Create Stripe Checkout Session
      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: metadata,
        customer_email: context.auth.token.email || undefined,
      });

      return { url: session.url, sessionId: session.id };
    } catch (error) {
      console.error("Error creating checkout session:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Error creating checkout session: " + error.message
      );
    }
  }
);

/**
 * Stripe Webhook Handler
 * Processes completed payments and updates user accounts
 *
 * IMPORTANT: Set up webhook in Stripe Dashboard pointing to:
 * https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/stripeWebhook
 *
 * Set webhook secret with: firebase functions:config:set stripe.webhook_secret="whsec_..."
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret =
    functions.config().stripe?.webhook_secret ||
    process.env.STRIPE_WEBHOOK_SECRET;

  // Get Stripe client (lazy initialization)
  let stripeClient;
  try {
    stripeClient = getStripeClient();
  } catch (err) {
    console.error("Failed to initialize Stripe:", err);
    return res.status(500).send("Stripe not configured");
  }

  let event;

  try {
    event = stripeClient.webhooks.constructEvent(
      req.rawBody,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      await handleSuccessfulPayment(session);
      break;

    case "payment_intent.succeeded":
      console.log("Payment intent succeeded:", event.data.object.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

/**
 * Handle successful payment
 * Updates user's seasonPass document with purchased items
 */
async function handleSuccessfulPayment(session) {
  const userId = session.metadata?.userId;
  const purchaseType = session.metadata?.type;
  const gems = parseInt(session.metadata?.gems) || 0;

  if (!userId) {
    console.error("No userId in session metadata");
    return;
  }

  const db = admin.firestore();
  const seasonPassRef = db.collection("seasonPass").doc(userId);

  try {
    await db.runTransaction(async (transaction) => {
      const seasonPassDoc = await transaction.get(seasonPassRef);

      let currentData = seasonPassDoc.exists
        ? seasonPassDoc.data()
        : {
            userId: userId,
            season: 3,
            level: 1,
            xp: 0,
            isPremium: false,
            coins: 0,
            gems: 0,
            brShields: 0,
            h2hVetos: 0,
            claimedRewards: [],
            unlockedCosmetics: [],
            unlockedBadges: [],
            unlockedTitles: [],
            createdAt: Date.now(),
          };

      if (purchaseType === "premium") {
        currentData.isPremium = true;
        console.log(`User ${userId} purchased Premium Pass`);
      } else if (purchaseType === "gems") {
        currentData.gems = (currentData.gems || 0) + gems;
        console.log(`User ${userId} purchased ${gems} gems`);
      }

      // Record purchase
      if (!currentData.purchases) currentData.purchases = [];
      currentData.purchases.push({
        type: purchaseType,
        amount: gems || "premium",
        stripeSessionId: session.id,
        timestamp: Date.now(),
      });

      transaction.set(seasonPassRef, currentData, { merge: true });
    });

    console.log(`Successfully processed payment for user ${userId}`);
  } catch (error) {
    console.error("Error processing payment:", error);
    throw error;
  }
}

/**
 * Manual gem addition (admin only)
 * For customer support or promotional purposes
 */
exports.adminAddGems = functions.https.onCall(async (data, context) => {
  // Verify admin status
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Not authenticated"
    );
  }

  // Check if user is admin (you'd check against your admin list)
  const adminUids = ["hbqztmmMWCUQ5plxCxDVPtjjSdR2"]; // Replace with actual admin UIDs
  if (!adminUids.includes(context.auth.uid)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin access required"
    );
  }

  const { targetUserId, gems, reason } = data;

  if (!targetUserId || !gems) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing targetUserId or gems"
    );
  }

  const db = admin.firestore();
  const seasonPassRef = db.collection("seasonPass").doc(targetUserId);

  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(seasonPassRef);
      const currentGems = doc.exists ? doc.data().gems || 0 : 0;

      transaction.set(
        seasonPassRef,
        {
          gems: currentGems + gems,
          adminGrants: admin.firestore.FieldValue.arrayUnion({
            grantedBy: context.auth.uid,
            amount: gems,
            reason: reason || "Admin grant",
            timestamp: Date.now(),
          }),
        },
        { merge: true }
      );
    });

    return {
      success: true,
      message: `Added ${gems} gems to user ${targetUserId}`,
    };
  } catch (error) {
    console.error("Error adding gems:", error);
    throw new functions.https.HttpsError("internal", "Error adding gems");
  }
});
