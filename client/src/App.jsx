import { useState } from 'react';
import './index.css'
import { useRef } from "react";
const backendUrl = "http://32.236.79.202:8080"

export default function App() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState();
  const paymentInProgress = useRef(false);

  async function handlepayment() {





    if (paymentInProgress.current) return;
    paymentInProgress.current = true;
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    console.log("Generated key:", idempotencyKey);
    console.log("Key length:", idempotencyKey.length);

    try {


      setLoading(true);
      setMessage("")


      // Step 1: Backend se Razorpay order create karwao
      const response = await fetch(`${backendUrl}/api/order-create`,
        {
          method: "POST",
          headers: {
            "Content-Type": 'application/json',
            "Idempotency-Key": idempotencyKey
          }
        })

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Order creation failed");
      }


      // Step 2:Checkout option configure karo

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: data.amount,
        currency: data.currency,
        name: "Payment pratice",
        description: "Wireless mouse",
        order_id: data.order,
        handler: async function (paymentResponse) {
          try {
            setMessage("Verifying payment...");

            const response = await fetch(
              `${backendUrl}/api/verify-payment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(paymentResponse),
              }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
              throw new Error(
                data.message || "Payment verification failed"
              );
            }

            setMessage("Payment signature verified successfully!");
            console.log("Verified payment:", data);

          } catch (error) {
            console.error("Verification error:", error);
            setMessage(error.message || "Unable to verify payment");
          }
        },

      }




      // Step 3:Razorpay CHeckout open karo
      const paymentobject = new window.Razorpay(options);
      paymentobject.on('Payment.failed', function (response) {
        console.error("Payment failed:", response.error);
        setMessage("Payment failed. Please try again.");
      })
      paymentobject.open();


      console.log("Order created:", data);
      setMessage(`Order Created: ${data.order}`)

    }
    catch (error) {
      console.error(error);
      setMessage(error.message);
    } finally {
      setLoading(false);
      paymentInProgress.current = false;
    }
  }
  return (
    <div >
      <h1 className="m-4">Pratice of Ecommerce application</h1>
      <div className="border border-black w-fit p-4 m-4">
        <img src="./mouse.jpg" className="" />
        <h1 className="text-xl font-bold mt-4">Wireless Mouse</h1>
        <p>price:₹499</p>
        <button onClick={handlepayment} disabled={loading} className="bg-blue-700 text-white text-sm font-medium px-4 py-1 rounded-sm my-2 cursor-pointer">{loading ? "Processing..." : "Pay Now"}</button>
      </div>
    </div>
  )
}