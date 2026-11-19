import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
    {
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        razorpayPaymentId: {
            type: String,
            default: null
        },
        razorpaySignature: {
            type: String,
            default: null,
            select: false
        },
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            required: true
        },
        receipt: {
            type: String,
            required: true
        },
        product: {
            type: String,
            default: null
        },
        idempotencyKey: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ["created", "paid"],
            default: "created"
        },
        razorpayOrderResponse: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        }
    },
    { timestamps: true }
)

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema)

export default Payment
