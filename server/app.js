import express from 'express'
import Razorpay from 'razorpay'
import cors from 'cors'
import crypto from 'crypto'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import Payment from './models/Payment.js'

const app = express();
const idemptotencyStore = new Map();
dotenv.config()
app.use(cors({ origin: "http://localhost:5173" }))

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/razorpay";


app.post(
    "/api/razorpay-webhooks",
    express.raw({ type: "application/json" }),
    (req, res) => {

        const webhookSignature = req.headers["x-razorpay-signature"];

        if (!webhookSignature || !Buffer.isBuffer(req.body)) {
            return res.status(400).json({
                success: false,
                message: "Missing signature or raw body"
            });
        }

        const expectedSignature = crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_WEBHOOK_SECRET
            )
            .update(req.body)
            .digest("hex");

        // Reject malformed signatures before comparing
        if (!/^[a-f0-9]{64}$/i.test(webhookSignature)) {
            return res.status(401).json({
                success: false,
                message: "Invalid webhook signature"
            });
        }

        const isValid = crypto.timingSafeEqual(
            Buffer.from(expectedSignature, "hex"),
            Buffer.from(webhookSignature, "hex")
        );

        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: "Webhook signature verification failed"
            });
        }

       

        const event = JSON.parse(req.body.toString("utf8"));

        console.log("Verified Razorpay webhook event:", event.event);

        return res.status(200).json({
            success: true,
            message: "Webhook signature verified"
        });
    }
);


app.use(express.json());

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})



app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Razorpay pratice server is running"
    })
})



app.post("/api/order-create", async (req, res) => {

    console.log("1. Create-order route hit");

    try {

        const idempotencyKey = req.headers["idempotency-key"];

        if (typeof idempotencyKey !== "string") {
            return res.status(400).json({
                success: false,
                message: "A valid idempotency key is required"
            });
        }

        if (idemptotencyStore.has(idempotencyKey)) {
            const existing = idemptotencyStore.get(idempotencyKey);
            try {
                console.log("Existing One", existing)
                const result = await existing;
                console.log("Result One", result)
                return res.status(200).json({
                    ...result,
                    reused: true
                })
            }
            catch (error) {
                return res.status(500).json({
                    success: false,
                    message: "Order creation failed; retry with the same key"
                })
            }
        }

        const orderPromise = (async () => {
            const order = await razorpay.orders.create({
                amount: 49900,
                currency: "INR",
                receipt: `mouse_${crypto.randomUUID().replaceAll("-", "")}`,
                notes: {
                    product: "Wireless Mouse",
                    idempotencyKey
                }
            })

            await Payment.create({
                razorpayOrderId: order.id,
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                product: order.notes?.product,
                idempotencyKey,
                razorpayOrderResponse: order
            })

            console.log("Rzorpay order is created successfully", order.id);

            return{
                success: true,
                message: "Razorpay Order is created successfully",
                order: order.id,
                amount: order.amount,
                currency: order.currency,

            }



           ;
        })();

        console.log("Order promise", orderPromise)


           idemptotencyStore.set(idempotencyKey, orderPromise);

        try {

            const result = await orderPromise;
            return res.status(201).json({
                ...result,
                reused: false
            });
        } catch (error) {
            if (idemptotencyStore.get(idempotencyKey) === orderPromise) {
                idemptotencyStore.delete(idempotencyKey);
            }
            return res.status(500).json({
                success: false,
                message: "Unable to save payment order",
                error: error.message
            });
        }


    }
    catch (error) {
        console.error("4. Order creation failed:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to create payment order",
            error: error.message,
        });
    }
})

app.post("/api/verify-payment", async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        // Step 1: Validate the received data
        if (
            typeof razorpay_order_id !== "string" ||
            typeof razorpay_payment_id !== "string" ||
            typeof razorpay_signature !== "string" ||
            !/^[a-f0-9]{64}$/i.test(razorpay_signature)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment verification data"
            });
        }

        // Step 2: Generate the expected signature
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        // Step 3: Compare both signatures safely
        const isAuthentic = crypto.timingSafeEqual(
            Buffer.from(expectedSignature, "hex"),
            Buffer.from(razorpay_signature, "hex")
        );

        // Step 4: Send the result
        if (!isAuthentic) {
            return res.status(401).json({
                success: false,
                message: "Payment signature verification failed"
            });
        }



        const payment = await Payment.findOneAndUpdate(
            { razorpayOrderId: razorpay_order_id },
            {
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                status: "paid"
            },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment order not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Payment signature verified and saved successfully",
            paymentId: payment.razorpayPaymentId
        });

    } catch (error) {
        console.error("Payment verification error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to verify payment"
        });
    }
});




const startServer = async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log("MongoDB connected successfully");

        const port = process.env.PORT || 8080;
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
};

startServer();