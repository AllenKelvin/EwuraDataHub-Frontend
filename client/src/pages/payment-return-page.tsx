import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-auth";
import { useAdminAllOrders } from "@/hooks/use-admin";

export default function PaymentReturnPage() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useUser();
  const userId = user?.id;
  const isWalletFunding = location === "/payment-complete";
  const [transactionAmount, setTransactionAmount] = useState<number | null>(null);
  const [previousBalance, setPreviousBalance] = useState<number | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  const params = new URLSearchParams(search);
  const reference = params.get("reference");
  const status = params.get("status");
  const success = params.get("trxref") || reference;
  const isSuccess = !!success && status !== "cancelled";

  useEffect(() => {
    if (!isWalletFunding || !reference || status === "cancelled" || userLoading || !user) return;
    const verifyWalletPayment = async () => {
      try {
        const { fetchWithAuth } = await import("@/lib/fetchWithAuth");
        const response = await fetchWithAuth("/api/payments/verify", {
          method: "POST",
          body: JSON.stringify({ reference }),
        });
        const data = await response.json();
        if (response.ok && data.status) {
          setVerificationMessage(`Wallet credited with GHS ${Number(data.amount).toFixed(2)}`);
          await qc.refetchQueries({ queryKey: ["/api/user"] });
        }
      } catch (error) {
        console.error("Payment verification failed", error);
      }
    };
    void verifyWalletPayment();
  }, [isWalletFunding, reference, status, userId, userLoading, qc]);

  // For order payments, verify and create orders
  useEffect(() => {
    if (isWalletFunding || !reference || status === "cancelled" || userLoading || !user) return;
    
    const verifyOrderPayment = async () => {
      try {
        const { fetchWithAuth } = await import("@/lib/fetchWithAuth");
        console.log("[PaymentReturn] Verifying order payment with reference:", reference);
        
        const response = await fetchWithAuth("/api/payments/verify-and-create-orders", {
          method: "POST",
          body: JSON.stringify({ reference }),
        });
        const data = await response.json();
        
        if (response.ok && data.status) {
          console.log("[PaymentReturn] Orders created successfully:", data.orders);
          setVerificationMessage(`Successfully created ${data.orders?.length || 0} order(s)`);
          
          // Refresh all relevant queries
          await qc.refetchQueries({ queryKey: ["/api/user"] });
          await qc.refetchQueries({ queryKey: [api.orders.listMyOrders.path] });
          await qc.refetchQueries({ queryKey: ["/api/cart"] });
        } else {
          console.error("[PaymentReturn] Order creation failed:", data.message);
          setVerificationMessage(data.message || "Failed to create orders");
        }
      } catch (error) {
        console.error("[PaymentReturn] Order verification failed", error);
        setVerificationMessage("Failed to verify payment");
      }
    };
    
    void verifyOrderPayment();
  }, [isWalletFunding, reference, status, userId, userLoading, qc, user]);

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["/api/cart"] });
    qc.invalidateQueries({ queryKey: [api.orders.listMyOrders.path] });
    qc.invalidateQueries({ queryKey: ["/api/user"] });
  }, [qc]);

  useEffect(() => {
    // Get the last order to determine transaction amount
    const getLastOrder = async () => {
      try {
        const { fetchWithAuth } = await import('@/lib/fetchWithAuth');
        const res = await fetchWithAuth(api.orders.listMyOrders.path);
        if (res.ok) {
          const response = await res.json();
          const orders = Array.isArray(response) ? response : response.orders;
          if (orders && orders.length > 0) {
            const lastOrder = orders[0];
            setTransactionAmount(lastOrder.price);
            // Calculate previous balance
            if (user?.balance !== undefined) {
              setPreviousBalance(user.balance + lastOrder.price);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch order details', err);
      }
    };

    if (!isWalletFunding && !userLoading && user && isSuccess) {
      getLastOrder();
    }
  }, [isWalletFunding, user, userLoading, isSuccess]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-border p-8 text-center">
        {isSuccess ? (
          <>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h1>
            <p className="text-muted-foreground mb-6">
              {isWalletFunding
                ? "Your wallet has been funded successfully."
                : "Your order has been placed. You can view it in Recent Orders on your dashboard."}
            </p>
            {verificationMessage && <p className="text-green-600 font-medium mb-4">{verificationMessage}</p>}

            {isWalletFunding && user && !userLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-left">
                <div className="text-sm font-medium text-blue-900">New Wallet Balance</div>
                <div className="text-xl font-bold text-blue-900 mt-1">GHS {Number(user.balance ?? 0).toFixed(2)}</div>
              </div>
            )}

            {!isWalletFunding && user?.role === 'agent' && !userLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 space-y-2 text-left">
                <div className="text-sm font-medium text-blue-900">Account Balance</div>
                {previousBalance !== null && transactionAmount !== null && (
                  <>
                    <div className="flex justify-between text-xs text-blue-700">
                      <span>Previous Balance:</span>
                      <span>GHS {previousBalance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-blue-700">
                      <span>Amount Charged:</span>
                      <span>-GHS {transactionAmount.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-blue-200 pt-2 flex justify-between text-sm font-bold text-blue-900">
                      <span>New Balance:</span>
                      <span>GHS {(user?.balance ?? 0).toFixed(2)}</span>
                    </div>
                  </>
                )}
                {previousBalance === null && (
                  <div className="text-xs text-blue-700">
                    Current Balance: GHS {(user?.balance ?? 0).toFixed(2)}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="w-10 h-10 text-amber-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Processing Payment</h1>
            <p className="text-muted-foreground mb-6">
              Please wait while we confirm your payment...
            </p>
          </>
        )}
        <Button
          onClick={() => setLocation("/")}
          className="w-full bg-primary hover:bg-primary/90"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
