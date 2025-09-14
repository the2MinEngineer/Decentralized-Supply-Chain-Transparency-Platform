(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-ORIGIN u101)
(define-constant ERR-INVALID-BATCH-ID u102)
(define-constant ERR-INVALID-CERTIFICATIONS u103)
(define-constant ERR-INVALID-DESCRIPTION u104)
(define-constant ERR-INVALID-PRODUCT-ID u105)
(define-constant ERR-PRODUCT-ALREADY-EXISTS u106)
(define-constant ERR-PRODUCT-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-SUPPLIER-NOT-CERTIFIED u109)
(define-constant ERR-CERTIFICATIONS-NOT-VERIFIED u110)
(define-constant ERR-INVALID-STATUS u111)
(define-constant ERR-INVALID-UPDATE-PARAM u112)
(define-constant ERR-MAX-PRODUCTS_EXCEEDED u113)
(define-constant ERR-INVALID-CATEGORY u114)
(define-constant ERR-INVALID-QUANTITY u115)
(define-constant ERR-INVALID-PRICE u116)
(define-constant ERR-INVALID-LOCATION u117)
(define-constant ERR-INVALID-CURRENCY u118)
(define-constant ERR-AUTHORITY-NOT-SET u119)
(define-constant ERR-INVALID-AUTHORITY u120)

(define-data-var next-product-id uint u0)
(define-data-var max-products uint u10000)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map Products
  uint
  {
    supplier: principal,
    origin: (string-ascii 100),
    batch-id: (string-ascii 50),
    certifications: (list 10 (string-ascii 50)),
    description: (string-ascii 256),
    registered-at: uint,
    category: (string-ascii 50),
    quantity: uint,
    price: uint,
    location: (string-ascii 100),
    currency: (string-ascii 20),
    status: bool
  }
)

(define-map ProductsByBatch
  (string-ascii 50)
  uint
)

(define-map ProductUpdates
  uint
  {
    update-origin: (string-ascii 100),
    update-batch-id: (string-ascii 50),
    update-description: (string-ascii 256),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-product (id uint))
  (map-get? Products id)
)

(define-read-only (get-product-updates (id uint))
  (map-get? ProductUpdates id)
)

(define-read-only (is-product-registered (batch-id (string-ascii 50)))
  (is-some (map-get? ProductsByBatch batch-id))
)

(define-private (validate-origin (origin (string-ascii 100)))
  (if (and (> (len origin) u0) (<= (len origin) u100))
      (ok true)
      (err ERR-INVALID-ORIGIN))
)

(define-private (validate-batch-id (batch-id (string-ascii 50)))
  (if (and (> (len batch-id) u0) (<= (len batch-id) u50))
      (ok true)
      (err ERR-INVALID-BATCH-ID))
)

(define-private (validate-certifications (certifications (list 10 (string-ascii 50))))
  (if (<= (len certifications) u10)
      (ok true)
      (err ERR-INVALID-CERTIFICATIONS))
)

(define-private (validate-description (description (string-ascii 256)))
  (if (<= (len description) u256)
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-category (category (string-ascii 50)))
  (if (and (> (len category) u0) (<= (len category) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-quantity (quantity uint))
  (if (> quantity u0)
      (ok true)
      (err ERR-INVALID-QUANTITY))
)

(define-private (validate-price (price uint))
  (if (>= price u0)
      (ok true)
      (err ERR-INVALID-PRICE))
)

(define-private (validate-location (location (string-ascii 100)))
  (if (and (> (len location) u0) (<= (len location) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-currency (currency (string-ascii 20)))
  (if (or (is-eq currency "STX") (is-eq currency "USD") (is-eq currency "BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-AUTHORITY))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-products (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-PRODUCTS_EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set max-products new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-product
  (origin (string-ascii 100))
  (batch-id (string-ascii 50))
  (certifications (list 10 (string-ascii 50)))
  (description (string-ascii 256))
  (category (string-ascii 50))
  (quantity uint)
  (price uint)
  (location (string-ascii 100))
  (currency (string-ascii 20))
)
  (let (
        (next-id (var-get next-product-id))
        (current-max (var-get max-products))
        (authority (var-get authority-contract))
        (supplier tx-sender)
      )
    (asserts! (< next-id current-max) (err ERR-MAX-PRODUCTS_EXCEEDED))
    (try! (validate-origin origin))
    (try! (validate-batch-id batch-id))
    (try! (validate-certifications certifications))
    (try! (validate-description description))
    (try! (validate-category category))
    (try! (validate-quantity quantity))
    (try! (validate-price price))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (asserts! (is-some (contract-call? .SupplierRegistry get-supplier supplier)) (err ERR-SUPPLIER-NOT-CERTIFIED))
    (asserts! (contract-call? .CertificationVerifier verify-certifications certifications) (err ERR-CERTIFICATIONS-NOT-VERIFIED))
    (asserts! (is-none (map-get? ProductsByBatch batch-id)) (err ERR-PRODUCT-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-SET))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient))
    )
    (map-set Products next-id
      {
        supplier: supplier,
        origin: origin,
        batch-id: batch-id,
        certifications: certifications,
        description: description,
        registered-at: block-height,
        category: category,
        quantity: quantity,
        price: price,
        location: location,
        currency: currency,
        status: true
      }
    )
    (map-set ProductsByBatch batch-id next-id)
    (var-set next-product-id (+ next-id u1))
    (print { event: "product-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-product
  (product-id uint)
  (update-origin (string-ascii 100))
  (update-batch-id (string-ascii 50))
  (update-description (string-ascii 256))
)
  (let ((product (map-get? Products product-id)))
    (match product
      p
        (begin
          (asserts! (is-eq (get supplier p) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-origin update-origin))
          (try! (validate-batch-id update-batch-id))
          (try! (validate-description update-description))
          (let ((existing (map-get? ProductsByBatch update-batch-id)))
            (match existing
              existing-id
                (asserts! (is-eq existing-id product-id) (err ERR-PRODUCT-ALREADY-EXISTS))
              (begin true)
            )
          )
          (let ((old-batch-id (get batch-id p)))
            (if (is-eq old-batch-id update-batch-id)
                (ok true)
                (begin
                  (map-delete ProductsByBatch old-batch-id)
                  (map-set ProductsByBatch update-batch-id product-id)
                  (ok true)
                )
            )
          )
          (map-set Products product-id
            {
              supplier: (get supplier p),
              origin: update-origin,
              batch-id: update-batch-id,
              certifications: (get certifications p),
              description: update-description,
              registered-at: (get registered-at p),
              category: (get category p),
              quantity: (get quantity p),
              price: (get price p),
              location: (get location p),
              currency: (get currency p),
              status: (get status p)
            }
          )
          (map-set ProductUpdates product-id
            {
              update-origin: update-origin,
              update-batch-id: update-batch-id,
              update-description: update-description,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "product-updated", id: product-id })
          (ok true)
        )
      (err ERR-PRODUCT-NOT-FOUND)
    )
  )
)

(define-public (get-product-count)
  (ok (var-get next-product-id))
)

(define-public (check-product-existence (batch-id (string-ascii 50)))
  (ok (is-product-registered batch-id))
)