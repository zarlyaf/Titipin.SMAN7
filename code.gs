/**
 * Project: Titipin 7 - SMAN 7 Semarang
 * Deskripsi: Sistem Titip Jual & COD Siswa
 */

const SPREADSHEET_ID = "1OlyZxaVdh7kmumA0pGyUt1Bd2ekgr_Jy567PhmdtX2s"; // Ganti dengan ID Spreadsheet Anda
const QRIS_IMAGE_URL = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=00020101021126630016ID.CO.GPN.WWW01189360091200000000000215ID10254276732110303U015103004652042767321153033605802ID5915WAROENG%20MAKAN%206007SOLO%20%20%206304C9F1";

/**
 * Routing & UI Logic
 */
function doGet(e) {
  const page = e.parameter.page || 'index';
  try {
    return HtmlService.createTemplateFromFile(page)
      .evaluate()
      .setTitle('Titipin 7')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput("Halaman tidak ditemukan: " + page);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl(page) {
  const url = ScriptApp.getService().getUrl();
  return page ? url + "?page=" + page : url;
}

/**
 * Database Helper
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheetData(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
}

/**
 * QRIS Support
 */
function getQrisImage() {
  return { success: true, url: QRIS_IMAGE_URL };
}

/**
 * PRODUCT LOGIC
 */
function addProduct(data) {
  try {
    const sheet = getSpreadsheet().getSheetByName('PRODUCTS');
    const productId = "PRD-" + new Date().getTime();
    
    // Default status: Pending (Menunggu pembayaran)
    sheet.appendRow([
      productId,
      data.namaProduk,
      data.kategori,
      data.harga,
      data.stok,
      data.namaPenitip,
      data.waPenitip,
      "Pending",
      new Date()
    ]);
    
    return { success: true, message: "Produk berhasil didaftarkan. Silahkan lanjut ke pembayaran.", productId: productId };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getActiveProducts() {
  try {
    const allProducts = getSheetData('PRODUCTS');
    return allProducts.filter(p => p.status === "Aktif" && p.stok > 0);
  } catch (err) {
    return [];
  }
}

/**
 * PAYMENT LOGIC
 */
function uploadPayment(data) {
  try {
    const sheet = getSpreadsheet().getSheetByName('PAYMENTS');
    const paymentId = "PAY-" + new Date().getTime();
    
    sheet.appendRow([
      paymentId,
      data.productId,
      data.namaPenitip,
      data.buktiTransfer, // Base64 string dari frontend
      "Pending",
      new Date()
    ]);
    
    return { success: true, message: "Bukti pembayaran terkirim. Admin akan memverifikasi." };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getPendingPayments() {
  try {
    return getSheetData('PAYMENTS').filter(p => p.status === "Pending");
  } catch (err) {
    return [];
  }
}

function verifyPayment(paymentId, status) {
  try {
    const ss = getSpreadsheet();
    const paySheet = ss.getSheetByName('PAYMENTS');
    const prodSheet = ss.getSheetByName('PRODUCTS');
    
    const payData = paySheet.getDataRange().getValues();
    let productId = "";

    // Update status di sheet PAYMENTS
    for (let i = 1; i < payData.length; i++) {
      if (payData[i][0] === paymentId) {
        paySheet.getRange(i + 1, 5).setValue(status);
        productId = payData[i][1];
        break;
      }
    }

    // Jika Verified, aktifkan produk
    if (status === "Verified" && productId) {
      const prodData = prodSheet.getDataRange().getValues();
      for (let j = 1; j < prodData.length; j++) {
        if (prodData[j][0] === productId) {
          prodSheet.getRange(j + 1, 8).setValue("Aktif");
          break;
        }
      }
    }

    return { success: true, message: "Status pembayaran diperbarui ke: " + status };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * ORDER LOGIC
 */
function createOrder(data) {
  try {
    const ss = getSpreadsheet();
    const orderSheet = ss.getSheetByName('ORDERS');
    const prodSheet = ss.getSheetByName('PRODUCTS');
    const orderId = "ORD-" + new Date().getTime();

    // 1. Simpan Order
    orderSheet.appendRow([
      orderId,
      data.productId,
      data.namaPembeli,
      data.kelas,
      data.qty,
      data.totalHarga,
      data.tanggalCOD,
      data.waktuCOD,
      data.tempatCOD,
      "Pesanan Baru"
    ]);

    // 2. Update Stok di Sheet PRODUCTS
    const prodData = prodSheet.getDataRange().getValues();
    for (let i = 1; i < prodData.length; i++) {
      if (prodData[i][0] === data.productId) {
        let currentStok = parseInt(prodData[i][4]);
        let newStok = currentStok - parseInt(data.qty);
        
        prodSheet.getRange(i + 1, 5).setValue(newStok);
        
        if (newStok <= 0) {
          prodSheet.getRange(i + 1, 8).setValue("Habis");
        }
        break;
      }
    }

    return { success: true, message: "Pesanan berhasil dibuat!", orderId: orderId };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getOrders() {
  try {
    return getSheetData('ORDERS');
  } catch (err) {
    return [];
  }
}

function updateOrderStatus(orderId, status) {
  try {
    const sheet = getSpreadsheet().getSheetByName('ORDERS');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === orderId) {
        sheet.getRange(i + 1, 10).setValue(status);
        break;
      }
    }
    return { success: true, message: "Status order berhasil diubah." };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}
