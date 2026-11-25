/**
 * FamilyGazette — Google Apps Script Relay & Drive Backend (Option A2)
 *
 * Deployed as a Web App ("Execute as: Me", "Who has access: Anyone").
 *
 * Human-Browsable Google Drive Layout inside `FamilyGazette/`:
 *   FamilyGazette/
 *   ├── family-db.json
 *   ├── Photos/<YYYY>/<YYYY-MM>/<YYYY-MM-DD>_<Author>_<shortId>.<ext>
 *   ├── Gazettes/<YYYY-MM>_N<02d>_<Title>.pdf & .html
 *   └── .app-cache/thumbs/thumb_<mediaId>.<ext>
 *
 * Isolates Private Messages server-side per signed member sessionToken,
 * validates secret-key Gazette links, and emails monthly digests & T-3 reminders
 * using Google MailApp ($0/month, no credit card, no Google Cloud project needed).
 */

var ROOT_FOLDER_NAME = 'FamilyGazette';
var PHOTOS_FOLDER_NAME = 'Photos';
var GAZETTES_FOLDER_NAME = 'Gazettes';
var APP_CACHE_FOLDER_NAME = '.app-cache';
var THUMBS_FOLDER_NAME = 'thumbs';
var LEGACY_MEDIA_FOLDER_NAME = 'media';
var DB_FILENAME = 'family-db.json';
var TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
var MAX_PDF_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB

var PROP_ROOT_FOLDER_ID = 'ROOT_FOLDER_ID';
var PROP_SIGNING_SECRET = 'SIGNING_SECRET';
var PROP_INVITE_CODE = 'FAMILY_INVITE_CODE';
var PROP_PUBLIC_URL = 'APP_PUBLIC_URL';

/**
 * Run ONCE in the Google Apps Script editor by the Family Admin.
 * Creates `FamilyGazette/{Photos,Gazettes,.app-cache/thumbs}`, random HMAC secret,
 * default invite code, and initial `family-db.json` if absent.
 */
function initializeFamilyGazette() {
  var props = PropertiesService.getScriptProperties();
  var rootFolder = ensureRootFolder_(props);
  ensureSubFolder_(rootFolder, PHOTOS_FOLDER_NAME);
  ensureSubFolder_(rootFolder, GAZETTES_FOLDER_NAME);
  var cacheFolder = ensureSubFolder_(rootFolder, APP_CACHE_FOLDER_NAME);
  ensureSubFolder_(cacheFolder, THUMBS_FOLDER_NAME);

  var secret = props.getProperty(PROP_SIGNING_SECRET);
  if (!secret) {
    secret = generateRandomHex_(32);
    props.setProperty(PROP_SIGNING_SECRET, secret);
  }

  var inviteCode = props.getProperty(PROP_INVITE_CODE);
  if (!inviteCode) {
    inviteCode = 'FAM-' + new Date().getFullYear();
    props.setProperty(PROP_INVITE_CODE, inviteCode);
  }

  var dbFile = findFileInFolder_(rootFolder, DB_FILENAME);
  if (!dbFile) {
    var emptyDb = createEmptyDb_(inviteCode);
    rootFolder.createFile(DB_FILENAME, JSON.stringify(emptyDb, null, 2), MimeType.PLAIN_TEXT);
  }

  Logger.log('FamilyGazette initialized cleanly.');
  Logger.log('Drive Folder ID: ' + rootFolder.getId());
  Logger.log('Invite Code: ' + inviteCode);
  return {
    rootFolderId: rootFolder.getId(),
    inviteCode: inviteCode,
  };
}

/**
 * Run ONCE to schedule the automated daily check for 3-day advance Gazette reminders.
 */
function installDailyReminderTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'checkScheduledReminders') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('checkScheduledReminders')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
  Logger.log('Installed daily trigger for checkScheduledReminders at 09:00.');
}

function doGet() {
  var props = PropertiesService.getScriptProperties();
  var configured = Boolean(props.getProperty(PROP_ROOT_FOLDER_ID));
  var familyName = '';
  if (configured) {
    try {
      var db = readDb_();
      familyName = db.settings && db.settings.familyName ? db.settings.familyName : '';
    } catch (e) {
      // ignore read errors on health probe
    }
  }
  return jsonResponse_({
    ok: true,
    app: 'FamilyGazette',
    version: 1,
    configured: configured,
    familyName: familyName,
  });
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var req = JSON.parse(raw);
    var action = req.action || '';

    if (action === 'ping') {
      return handlePing_();
    }
    if (action === 'getPublicGazette') {
      return handleGetPublicGazette_(req);
    }
    if (action === 'getMedia' && req.issueId && req.secretKey && !req.sessionToken) {
      return handleGetMediaPublic_(req);
    }

    // All remaining actions require a valid Family Invite Code
    verifyInviteCode_(req.inviteCode);

    if (action === 'bootstrap') {
      return handleBootstrap_();
    }
    if (action === 'login') {
      return handleLogin_(req);
    }

    // Authenticated member endpoints
    var authProfileId = verifySessionToken_(req.sessionToken);

    if (action === 'pullDb') {
      return handlePullDb_(authProfileId);
    }
    if (action === 'pushDb') {
      return handlePushDb_(req, authProfileId);
    }
    if (action === 'uploadMedia') {
      return handleUploadMedia_(req, authProfileId);
    }
    if (action === 'getMedia') {
      return handleGetMediaAuth_(req, authProfileId);
    }
    if (action === 'sendGazette') {
      return handleSendGazette_(req, authProfileId);
    }
    if (action === 'archiveGazetteFiles') {
      return handleArchiveGazetteFiles_(req, authProfileId);
    }
    if (action === 'sendReminder') {
      return handleSendReminder_(req, authProfileId);
    }

    return errorResponse_('SERVER_ERROR', 'Unknown action: ' + action);
  } catch (err) {
    if (err && err.errorCode) {
      return errorResponse_(err.errorCode, err.message || 'Request rejected');
    }
    return errorResponse_('SERVER_ERROR', String(err && err.message ? err.message : err));
  }
}

/* -------------------------------------------------------------------------- */
/*                                Action Handlers                              */
/* -------------------------------------------------------------------------- */

function handlePing_() {
  var props = PropertiesService.getScriptProperties();
  var configured = Boolean(props.getProperty(PROP_ROOT_FOLDER_ID));
  var familyName = '';
  if (configured) {
    var db = readDb_();
    familyName = db.settings && db.settings.familyName ? db.settings.familyName : '';
  }
  return jsonResponse_({ ok: true, configured: configured, familyName: familyName });
}

function handleBootstrap_() {
  var db = readDb_();
  return jsonResponse_({
    ok: true,
    db: filterDbForBootstrap_(db),
    syncedAt: new Date().toISOString(),
  });
}

function handleLogin_(req) {
  var profileId = String(req.profileId || '').trim();
  if (!profileId) {
    throw createRelayError_('UNAUTHORIZED', 'Missing profileId.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var db = readDb_();
    var profiles = db.profiles || [];
    var activeProfiles = profiles.filter(function (p) {
      return p && !p.deletedAt;
    });
    var target = null;
    for (var i = 0; i < activeProfiles.length; i++) {
      if (activeProfiles[i].id === profileId) {
        target = activeProfiles[i];
        break;
      }
    }

    // Allow initial Admin bootstrap or invited member creation when inviteCode verified
    if (!target && req.bootstrapProfile && req.bootstrapProfile.id === profileId) {
      var boot = cloneJson_(req.bootstrapProfile);
      if (activeProfiles.length > 0 && boot.role === 'admin') {
        boot.role = 'member';
      }
      if (activeProfiles.length === 0) {
        boot.role = 'admin';
      }
      db.profiles = mergeRecordArrays_(db.profiles || [], [boot]);
      db.updatedAt = new Date().toISOString();
      writeDb_(db);
      target = boot;
    }

    if (!target) {
      throw createRelayError_('NOT_FOUND', 'Family profile not found.');
    }

    if (target.pinHash) {
      var candidatePin = req.pin != null ? String(req.pin) : '';
      var expectedHash = computeSaltedPinHash_(target.id, candidatePin);
      if (expectedHash !== target.pinHash) {
        throw createRelayError_('UNAUTHORIZED', 'Incorrect PIN.');
      }
    }

    var token = issueSessionToken_(target.id);
    return jsonResponse_({
      ok: true,
      profileId: target.id,
      sessionToken: token,
      db: filterDbForProfile_(db, target.id),
      syncedAt: new Date().toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function handlePullDb_(authProfileId) {
  var db = readDb_();
  return jsonResponse_({
    ok: true,
    db: filterDbForProfile_(db, authProfileId),
    syncedAt: new Date().toISOString(),
  });
}

function handlePushDb_(req, authProfileId) {
  if (!req.db || typeof req.db !== 'object') {
    throw createRelayError_('SERVER_ERROR', 'Missing db payload.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var serverDb = readDb_();
    var merged = mergeDatabasesServer_(serverDb, req.db, authProfileId);
    writeDb_(merged);
    return jsonResponse_({
      ok: true,
      db: filterDbForProfile_(merged, authProfileId),
      syncedAt: new Date().toISOString(),
    });
  } finally {
    lock.releaseLock();
  }
}

function handleUploadMedia_(req, authProfileId) {
  var mediaId = String(req.mediaId || '').replace(/[^A-Za-z0-9_-]/g, '');
  var variant = req.variant === 'thumb' ? 'thumb' : 'full';
  var mimeType = req.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  var base64Data = String(req.base64Data || '').replace(/^data:[^;]+;base64,/, '');

  if (!mediaId || !base64Data) {
    throw createRelayError_('SERVER_ERROR', 'Missing mediaId or base64Data.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var db = readDb_();
    var mediaRecord = findMediaRecord_(db, mediaId);
    var fieldName = variant === 'thumb' ? 'driveThumbFileId' : 'driveFileId';

    if (mediaRecord && mediaRecord[fieldName]) {
      var existingById = getDriveFileSafe_(mediaRecord[fieldName]);
      if (existingById) {
        return jsonResponse_({
          ok: true,
          mediaId: mediaId,
          variant: variant,
          driveFileId: existingById.getId(),
        });
      }
    }

    var root = ensureRootFolder_(PropertiesService.getScriptProperties());
    var ext = mimeType === 'image/jpeg' ? 'jpg' : 'webp';
    var targetFolder;
    var fileName;

    if (variant === 'thumb') {
      var cacheFolder = ensureSubFolder_(root, APP_CACHE_FOLDER_NAME);
      targetFolder = ensureSubFolder_(cacheFolder, THUMBS_FOLDER_NAME);
      fileName = 'thumb_' + mediaId + '.' + ext;
    } else {
      var resolvedMeta = resolvePhotoMetadata_(db, req, mediaRecord, authProfileId, mediaId, ext);
      var photosFolder = ensureSubFolder_(root, PHOTOS_FOLDER_NAME);
      var yearFolder = ensureSubFolder_(photosFolder, resolvedMeta.year);
      targetFolder = ensureSubFolder_(yearFolder, resolvedMeta.yearMonth);
      fileName = resolvedMeta.fileName;
    }

    var existingByName = findFileInFolder_(targetFolder, fileName);
    var savedFile;
    if (existingByName) {
      savedFile = existingByName;
    } else {
      var bytes = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(bytes, mimeType, fileName);
      savedFile = targetFolder.createFile(blob);
    }

    var now = new Date().toISOString();
    var updated = false;
    db.media = (db.media || []).map(function (m) {
      if (m.id === mediaId) {
        m[fieldName] = savedFile.getId();
        m.updatedAt = now;
        updated = true;
      }
      return m;
    });
    if (updated) {
      writeDb_(db);
    }

    return jsonResponse_({
      ok: true,
      mediaId: mediaId,
      variant: variant,
      driveFileId: savedFile.getId(),
    });
  } finally {
    lock.releaseLock();
  }
}

function handleGetMediaAuth_(req, authProfileId) {
  if (!authProfileId) {
    throw createRelayError_('UNAUTHORIZED', 'Authentication required.');
  }
  var db = readDb_();
  return readMediaPayload_(db, String(req.mediaId || ''), req.variant === 'thumb' ? 'thumb' : 'full');
}

function handleGetMediaPublic_(req) {
  var db = readDb_();
  var issue = validateIssueSecretOrThrow_(db, req.issueId, req.secretKey);
  var mediaId = String(req.mediaId || '');
  var allowed = isMediaAllowedForIssue_(db, issue, mediaId);
  if (!allowed) {
    throw createRelayError_('FORBIDDEN', 'Media does not belong to this Gazette issue.');
  }
  return readMediaPayload_(db, mediaId, req.variant === 'thumb' ? 'thumb' : 'full');
}

function readMediaPayload_(db, mediaId, variant) {
  var cleanId = String(mediaId || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!cleanId) {
    throw createRelayError_('NOT_FOUND', 'Media not found.');
  }

  var file = findMediaDriveFile_(db, cleanId, variant);
  if (!file && variant === 'thumb') {
    file = findMediaDriveFile_(db, cleanId, 'full');
  }
  if (!file) {
    throw createRelayError_('NOT_FOUND', 'Media binary not found in Drive.');
  }

  var blob = file.getBlob();
  return jsonResponse_({
    ok: true,
    mediaId: cleanId,
    variant: variant,
    mimeType: blob.getContentType() || 'image/webp',
    base64Data: Utilities.base64Encode(blob.getBytes()),
  });
}

function handleGetPublicGazette_(req) {
  var db = readDb_();
  var issue = validateIssueSecretOrThrow_(db, req.issueId, req.secretKey);
  return jsonResponse_({
    ok: true,
    payload: buildScopedGazettePayloadServer_(db, issue),
  });
}

function handleArchiveGazetteFiles_(req, authProfileId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var db = readDb_();
    if (!isProfileAdmin_(authProfileId, db.profiles || [])) {
      throw createRelayError_('FORBIDDEN', 'Only a Family Admin can archive Gazettes.');
    }

    var issueId = String(req.issueId || '');
    var issueIdx = findIssueIndex_(db, issueId);
    if (issueIdx === -1) {
      throw createRelayError_('NOT_FOUND', 'Gazette issue not found.');
    }
    var issue = db.gazettes[issueIdx];
    var saved = archiveIssueAssetsToDrive_(issue, req.pdfBase64, req.pdfFilename, req.htmlContent, req.htmlFilename);

    var now = new Date().toISOString();
    if (saved.pdfDriveFileId) issue.pdfDriveFileId = saved.pdfDriveFileId;
    if (saved.htmlDriveFileId) issue.htmlDriveFileId = saved.htmlDriveFileId;
    issue.updatedAt = now;
    db.gazettes[issueIdx] = issue;
    db.updatedAt = now;
    writeDb_(db);

    return jsonResponse_({
      ok: true,
      pdfDriveFileId: issue.pdfDriveFileId || undefined,
      htmlDriveFileId: issue.htmlDriveFileId || undefined,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleSendGazette_(req, authProfileId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var db = readDb_();
    if (!isProfileAdmin_(authProfileId, db.profiles || [])) {
      throw createRelayError_('FORBIDDEN', 'Only a Family Admin can dispatch Gazettes.');
    }

    var issueId = String(req.issueId || '');
    var issueIdx = findIssueIndex_(db, issueId);
    if (issueIdx === -1) {
      throw createRelayError_('NOT_FOUND', 'Gazette issue not found.');
    }
    var issue = db.gazettes[issueIdx];

    var archived = archiveIssueAssetsToDrive_(
      issue,
      req.pdfBase64,
      req.pdfFilename,
      req.htmlContent,
      req.htmlFilename,
    );

    // Inline CID thumbnail blobs
    var inlineImages = {};
    var cidMediaIds = req.cidMediaIds || [];
    for (var c = 0; c < cidMediaIds.length; c++) {
      var mid = String(cidMediaIds[c]).replace(/[^A-Za-z0-9_-]/g, '');
      if (!mid) continue;
      var mf = findMediaDriveFile_(db, mid, 'thumb') || findMediaDriveFile_(db, mid, 'full');
      if (mf) {
        inlineImages['thumb_' + c] = mf.getBlob();
      }
    }

    var activeSubs = (db.subscribers || []).filter(function (s) {
      return s && !s.deletedAt && s.active && s.email && s.email.indexOf('@') > 0;
    });

    var sentCount = 0;
    var skippedCount = 0;
    var sentEmails = [];
    var digests = req.digestsByLanguage || {};

    for (var sIdx = 0; sIdx < activeSubs.length; sIdx++) {
      var sub = activeSubs[sIdx];
      var subLang = sub.language === 'en' ? 'en' : 'fr';
      var digest = digests[subLang] || digests.fr || digests.en;
      if (!digest) {
        skippedCount += 1;
        continue;
      }

      var emailOptions = {
        htmlBody: digest.html,
        name: db.settings && db.settings.familyName ? db.settings.familyName : 'FamilyGazette',
      };
      if (Object.keys(inlineImages).length > 0 && digest.html.indexOf('cid:thumb_') !== -1) {
        emailOptions.inlineImages = inlineImages;
      }
      if (
        sub.deliveryMode === 'digest_and_pdf_attachment' &&
        archived.pdfBlob &&
        archived.pdfBlob.getBytes().length <= MAX_PDF_ATTACHMENT_BYTES
      ) {
        emailOptions.attachments = [archived.pdfBlob];
      }

      MailApp.sendEmail(sub.email, digest.subject, digest.plainText || digest.subject, emailOptions);
      sentCount += 1;
      sentEmails.push(sub.email);
    }

    var now = new Date().toISOString();
    issue.sentAt = now;
    issue.deliveryChannel = 'apps-script';
    issue.recipientEmails = sentEmails;
    if (archived.pdfDriveFileId) issue.pdfDriveFileId = archived.pdfDriveFileId;
    if (archived.htmlDriveFileId) issue.htmlDriveFileId = archived.htmlDriveFileId;
    issue.updatedAt = now;
    db.gazettes[issueIdx] = issue;
    db.updatedAt = now;
    writeDb_(db);

    return jsonResponse_({
      ok: true,
      sentCount: sentCount,
      skippedCount: skippedCount,
      remainingQuota: MailApp.getRemainingDailyQuota(),
      pdfDriveFileId: issue.pdfDriveFileId || undefined,
      htmlDriveFileId: issue.htmlDriveFileId || undefined,
      sentAt: now,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleSendReminder_(req, authProfileId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var db = readDb_();
    if (!isProfileAdmin_(authProfileId, db.profiles || [])) {
      throw createRelayError_('FORBIDDEN', 'Only a Family Admin can send contributor reminders.');
    }

    var result = dispatchRemindersInternal_(db, String(req.cycleKey || ''), req.remindersByLanguage);
    return jsonResponse_({
      ok: true,
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
      remainingQuota: MailApp.getRemainingDailyQuota(),
      cycleKey: result.cycleKey,
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Daily automated time-based trigger entrypoint.
 * Sends T-3 reminder emails once per monthly/weekly cycle when the reminder date matches today.
 */
function checkScheduledReminders() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var db = readDb_();
    var settings = db.settings || {};
    var schedule = computeNextScheduleServer_(settings, new Date());
    if (!schedule.isReminderDueToday || !schedule.cycleKey) {
      return;
    }

    var queuedCount = (db.posts || []).filter(function (p) {
      return p && !p.deletedAt && p.includeInGazette && (!p.publishedIssueIds || p.publishedIssueIds.length === 0);
    }).length;

    var publicUrl = PropertiesService.getScriptProperties().getProperty(PROP_PUBLIC_URL) || '';
    var remindersByLanguage = {
      fr: buildServerReminder_('fr', settings, schedule.nextPublishDate, queuedCount, publicUrl),
      en: buildServerReminder_('en', settings, schedule.nextPublishDate, queuedCount, publicUrl),
    };

    dispatchRemindersInternal_(db, schedule.cycleKey, remindersByLanguage);
  } finally {
    lock.releaseLock();
  }
}

/* -------------------------------------------------------------------------- */
/*                       Drive Path & Organization Helpers                    */
/* -------------------------------------------------------------------------- */

function slugifySegment_(input, fallback, maxLen) {
  var limit = maxLen || 36;
  var clean = String(input || '');
  if (typeof clean.normalize === 'function') {
    clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  clean = clean
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, limit)
    .replace(/-+$/, '');
  return clean || fallback || 'Item';
}

function resolvePhotoMetadata_(db, req, mediaRecord, authProfileId, mediaId, ext) {
  var rawDate = req.memoryDate ? String(req.memoryDate).slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    var posts = db.posts || [];
    for (var i = 0; i < posts.length; i++) {
      if (posts[i] && !posts[i].deletedAt && posts[i].mediaIds && posts[i].mediaIds.indexOf(mediaId) !== -1) {
        rawDate = String(posts[i].memoryDate || '').slice(0, 10);
        break;
      }
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) && mediaRecord && mediaRecord.createdAt) {
    rawDate = String(mediaRecord.createdAt).slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    rawDate = new Date().toISOString().slice(0, 10);
  }

  var authorName = req.authorName ? String(req.authorName) : '';
  if (!authorName) {
    var uploaderId = (mediaRecord && mediaRecord.uploadedByProfileId) || authProfileId;
    var profiles = db.profiles || [];
    for (var p = 0; p < profiles.length; p++) {
      if (profiles[p] && profiles[p].id === uploaderId) {
        authorName = profiles[p].name;
        break;
      }
    }
  }

  var authorSlug = slugifySegment_(authorName, 'Famille', 24);
  var strippedId = String(mediaId || '').replace(/^med-/, '').replace(/[^A-Za-z0-9]/g, '');
  var shortId = (strippedId.slice(0, 8) || 'photo').toLowerCase();

  return {
    year: rawDate.slice(0, 4),
    yearMonth: rawDate.slice(0, 7),
    fileName: rawDate + '_' + authorSlug + '_' + shortId + '.' + ext,
  };
}

function buildGazetteBaseName_(issue) {
  var rawEnd = String(issue.periodEnd || '').slice(0, 7);
  var ym = /^\d{4}-\d{2}$/.test(rawEnd) ? rawEnd : new Date().toISOString().slice(0, 7);
  var numStr = String(Math.max(1, Number(issue.issueNumber || 1)));
  while (numStr.length < 2) numStr = '0' + numStr;
  var titleSlug = slugifySegment_(issue.title || 'Gazette', 'Gazette', 40);
  return ym + '_N' + numStr + '_' + titleSlug;
}

function archiveIssueAssetsToDrive_(issue, pdfBase64, pdfFilename, htmlContent, htmlFilename) {
  var root = ensureRootFolder_(PropertiesService.getScriptProperties());
  var gazettesFolder = ensureSubFolder_(root, GAZETTES_FOLDER_NAME);
  var baseName = buildGazetteBaseName_(issue);

  var pdfBlob = null;
  var pdfDriveFileId = issue.pdfDriveFileId || '';
  if (pdfBase64) {
    var cleanPdfB64 = String(pdfBase64).replace(/^data:[^;]+;base64,/, '');
    var pdfBytes = Utilities.base64Decode(cleanPdfB64);
    var pdfName = pdfFilename || baseName + '.pdf';
    pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', pdfName);
    var prevPdf = findFileInFolder_(gazettesFolder, pdfName);
    if (prevPdf) prevPdf.setTrashed(true);
    var createdPdf = gazettesFolder.createFile(pdfBlob);
    pdfDriveFileId = createdPdf.getId();
  }

  var htmlDriveFileId = issue.htmlDriveFileId || '';
  if (htmlContent) {
    var htmlName = htmlFilename || baseName + '.html';
    var htmlBlob = Utilities.newBlob(String(htmlContent), 'text/html', htmlName);
    var prevHtml = findFileInFolder_(gazettesFolder, htmlName);
    if (prevHtml) prevHtml.setTrashed(true);
    var createdHtml = gazettesFolder.createFile(htmlBlob);
    htmlDriveFileId = createdHtml.getId();
  }

  return {
    pdfBlob: pdfBlob,
    pdfDriveFileId: pdfDriveFileId || undefined,
    htmlDriveFileId: htmlDriveFileId || undefined,
  };
}

function findMediaRecord_(db, mediaId) {
  var list = db.media || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === mediaId) return list[i];
  }
  return null;
}

function getDriveFileSafe_(fileId) {
  if (!fileId) return null;
  try {
    var f = DriveApp.getFileById(fileId);
    if (f && !f.isTrashed()) return f;
  } catch (e) {
    // ignore missing/unreadable ID
  }
  return null;
}

function findMediaDriveFile_(db, cleanId, variant) {
  var record = findMediaRecord_(db, cleanId);
  if (record) {
    var preferredId = variant === 'thumb' ? record.driveThumbFileId : record.driveFileId;
    var byId = getDriveFileSafe_(preferredId);
    if (byId) return byId;
  }

  var root = ensureRootFolder_(PropertiesService.getScriptProperties());
  if (variant === 'thumb') {
    var cacheFolder = findSubFolder_(root, APP_CACHE_FOLDER_NAME);
    var thumbsFolder = cacheFolder ? findSubFolder_(cacheFolder, THUMBS_FOLDER_NAME) : null;
    if (thumbsFolder) {
      var thumbMatch =
        findFileInFolder_(thumbsFolder, 'thumb_' + cleanId + '.webp') ||
        findFileInFolder_(thumbsFolder, 'thumb_' + cleanId + '.jpg');
      if (thumbMatch) return thumbMatch;
    }
  }

  // Fallback for legacy flat media/ folder or renamed photos containing shortId
  var legacyFolder = findSubFolder_(root, LEGACY_MEDIA_FOLDER_NAME);
  if (legacyFolder) {
    var prefix = variant === 'thumb' ? 'thumb_' : 'img_';
    var legacyMatch =
      findFileInFolder_(legacyFolder, prefix + cleanId + '.webp') ||
      findFileInFolder_(legacyFolder, prefix + cleanId + '.jpg');
    if (legacyMatch) return legacyMatch;
  }

  return null;
}

function findIssueIndex_(db, issueId) {
  var gazettes = db.gazettes || [];
  for (var i = 0; i < gazettes.length; i++) {
    if (gazettes[i].id === issueId && !gazettes[i].deletedAt) {
      return i;
    }
  }
  return -1;
}

/* -------------------------------------------------------------------------- */
/*                          Auth, Privacy & Merge Helpers                      */
/* -------------------------------------------------------------------------- */

function verifyInviteCode_(candidateCode) {
  var props = PropertiesService.getScriptProperties();
  var expected = String(props.getProperty(PROP_INVITE_CODE) || '').trim();
  if (!expected) {
    throw createRelayError_('SERVER_ERROR', 'Relay invite code is not initialized.');
  }
  if (String(candidateCode || '').trim() !== expected) {
    throw createRelayError_('INVALID_INVITE_CODE', 'Invalid Family Invite Code.');
  }
}

function computeSaltedPinHash_(profileId, pin) {
  var input = 'familygazette-v1:' + String(profileId) + ':' + String(pin || '').trim();
  var rawBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < rawBytes.length; i++) {
    var b = rawBytes[i] < 0 ? rawBytes[i] + 256 : rawBytes[i];
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

function issueSessionToken_(profileId) {
  var secret = PropertiesService.getScriptProperties().getProperty(PROP_SIGNING_SECRET);
  if (!secret) {
    throw createRelayError_('SERVER_ERROR', 'Signing secret missing.');
  }
  var payload = {
    pid: profileId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  var payloadB64 = toBase64Url_(JSON.stringify(payload));
  var sigBytes = Utilities.computeHmacSha256Signature(payloadB64, secret);
  var sigB64 = toBase64UrlBytes_(sigBytes);
  return payloadB64 + '.' + sigB64;
}

function verifySessionToken_(token) {
  if (!token || String(token).indexOf('.') === -1) {
    throw createRelayError_('UNAUTHORIZED', 'Missing or malformed session token.');
  }
  var parts = String(token).split('.');
  var payloadB64 = parts[0];
  var sigB64 = parts[1];
  var secret = PropertiesService.getScriptProperties().getProperty(PROP_SIGNING_SECRET);
  if (!secret) {
    throw createRelayError_('SERVER_ERROR', 'Signing secret missing.');
  }
  var expectedSig = toBase64UrlBytes_(Utilities.computeHmacSha256Signature(payloadB64, secret));
  if (expectedSig !== sigB64) {
    throw createRelayError_('UNAUTHORIZED', 'Invalid session token signature.');
  }
  var jsonStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString('UTF-8');
  var payload = JSON.parse(jsonStr);
  if (!payload || !payload.pid || !payload.exp) {
    throw createRelayError_('UNAUTHORIZED', 'Invalid token payload.');
  }
  if (Date.now() > Number(payload.exp)) {
    throw createRelayError_('TOKEN_EXPIRED', 'Session token expired.');
  }
  return String(payload.pid);
}

function isProfileAdmin_(profileId, profiles) {
  var active = (profiles || []).filter(function (p) {
    return p && !p.deletedAt;
  });
  var hasExplicit = active.some(function (p) {
    return p.role === 'admin';
  });
  for (var i = 0; i < active.length; i++) {
    if (active[i].id === profileId) {
      if (hasExplicit) return active[i].role === 'admin';
      return i === 0;
    }
  }
  return false;
}

function filterDbForBootstrap_(db) {
  var copy = cloneJson_(db);
  copy.messages = [];
  copy.messageReplies = [];
  copy.subscribers = [];
  copy.gazettes = [];
  return copy;
}

function filterDbForProfile_(db, profileId) {
  var copy = cloneJson_(db);
  var visibleMsgIds = {};
  copy.messages = (db.messages || []).filter(function (m) {
    if (!m) return false;
    var ok =
      m.senderProfileId === profileId ||
      (m.recipientProfileIds && m.recipientProfileIds.indexOf(profileId) !== -1);
    if (ok) visibleMsgIds[m.id] = true;
    return ok;
  });

  copy.messageReplies = (db.messageReplies || []).filter(function (r) {
    return r && Boolean(visibleMsgIds[r.messageId]);
  });

  if (!isProfileAdmin_(profileId, db.profiles || [])) {
    copy.subscribers = (db.subscribers || []).filter(function (s) {
      return s && s.profileId === profileId;
    });
  }
  return copy;
}

function mergeDatabasesServer_(serverDb, incomingDb, authProfileId) {
  var isAdmin = isProfileAdmin_(authProfileId, serverDb.profiles || []);
  var mergedSettings = isAdmin
    ? mergeSettings_(serverDb.settings, incomingDb.settings)
    : serverDb.settings;

  // Preserve other users' private messages outside caller visibility
  var serverMsgMap = {};
  (serverDb.messages || []).forEach(function (m) {
    if (m && m.id) serverMsgMap[m.id] = m;
  });

  var scopedIncomingMsgs = (incomingDb.messages || []).filter(function (m) {
    if (!m || !m.id) return false;
    var existing = serverMsgMap[m.id];
    if (existing) {
      return (
        existing.senderProfileId === authProfileId ||
        (existing.recipientProfileIds && existing.recipientProfileIds.indexOf(authProfileId) !== -1)
      );
    }
    return m.senderProfileId === authProfileId;
  });

  var mergedMessages = mergeRecordArrays_(serverDb.messages || [], scopedIncomingMsgs);
  var allowedMsgIds = {};
  mergedMessages.forEach(function (m) {
    if (
      m &&
      (m.senderProfileId === authProfileId ||
        (m.recipientProfileIds && m.recipientProfileIds.indexOf(authProfileId) !== -1))
    ) {
      allowedMsgIds[m.id] = true;
    }
  });

  var scopedIncomingReplies = (incomingDb.messageReplies || []).filter(function (r) {
    return r && r.messageId && Boolean(allowedMsgIds[r.messageId]);
  });

  var mergedGazettes = isAdmin
    ? mergeRecordArrays_(serverDb.gazettes || [], incomingDb.gazettes || [])
    : serverDb.gazettes || [];

  var mergedSubscribers = isAdmin
    ? mergeRecordArrays_(serverDb.subscribers || [], incomingDb.subscribers || [])
    : mergeRecordArrays_(
        serverDb.subscribers || [],
        (incomingDb.subscribers || []).filter(function (s) {
          return s && s.profileId === authProfileId;
        }),
      );

  if (isAdmin && mergedSettings && mergedSettings.inviteCode) {
    PropertiesService.getScriptProperties().setProperty(
      PROP_INVITE_CODE,
      String(mergedSettings.inviteCode).trim(),
    );
  }

  return {
    schemaVersion: 1,
    dbId: serverDb.dbId || incomingDb.dbId,
    updatedAt: new Date().toISOString(),
    settings: mergedSettings,
    profiles: mergeRecordArrays_(serverDb.profiles || [], incomingDb.profiles || []),
    rememberedPeople: mergeRecordArrays_(
      serverDb.rememberedPeople || [],
      incomingDb.rememberedPeople || [],
    ),
    media: mergeRecordArrays_(serverDb.media || [], incomingDb.media || []),
    posts: mergeRecordArrays_(serverDb.posts || [], incomingDb.posts || []),
    comments: mergeRecordArrays_(serverDb.comments || [], incomingDb.comments || []),
    messages: mergedMessages,
    messageReplies: mergeRecordArrays_(serverDb.messageReplies || [], scopedIncomingReplies),
    subscribers: mergedSubscribers,
    gazettes: mergedGazettes,
  };
}

function mergeRecordArrays_(baseArr, incomingArr) {
  var map = {};
  var i;
  for (i = 0; i < (baseArr || []).length; i++) {
    if (baseArr[i] && baseArr[i].id) {
      map[baseArr[i].id] = baseArr[i];
    }
  }
  for (i = 0; i < (incomingArr || []).length; i++) {
    var item = incomingArr[i];
    if (!item || !item.id) continue;
    var existing = map[item.id];
    if (!existing) {
      map[item.id] = item;
      continue;
    }
    var itemTs = Math.max(parseIsoMs_(item.updatedAt), parseIsoMs_(item.deletedAt));
    var existingTs = Math.max(parseIsoMs_(existing.updatedAt), parseIsoMs_(existing.deletedAt));
    if (itemTs >= existingTs) {
      map[item.id] = item;
    }
  }
  return Object.keys(map).map(function (k) {
    return map[k];
  });
}

function mergeSettings_(serverSettings, incomingSettings) {
  var sTs = Math.max(
    parseIsoMs_(serverSettings && serverSettings.updatedAt),
    parseIsoMs_(serverSettings && serverSettings.deletedAt),
  );
  var iTs = Math.max(
    parseIsoMs_(incomingSettings && incomingSettings.updatedAt),
    parseIsoMs_(incomingSettings && incomingSettings.deletedAt),
  );
  return iTs >= sTs && incomingSettings ? incomingSettings : serverSettings;
}

function validateIssueSecretOrThrow_(db, issueId, secretKey) {
  var id = String(issueId || '').trim();
  var key = String(secretKey || '').trim();
  var target = null;
  for (var i = 0; i < (db.gazettes || []).length; i++) {
    if (db.gazettes[i].id === id && !db.gazettes[i].deletedAt) {
      target = db.gazettes[i];
      break;
    }
  }
  if (!target) {
    throw createRelayError_('NOT_FOUND', 'Gazette issue not found.');
  }
  if (!key || target.secretKey !== key) {
    throw createRelayError_('UNAUTHORIZED', 'Invalid Gazette secret key.');
  }
  if (target.shareRevoked) {
    throw createRelayError_('FORBIDDEN', 'This Gazette share link was revoked.');
  }
  if (target.shareExpiresAt && Date.now() > Date.parse(target.shareExpiresAt)) {
    throw createRelayError_('FORBIDDEN', 'This Gazette share link has expired.');
  }
  return target;
}

function isMediaAllowedForIssue_(db, issue, mediaId) {
  var postSet = {};
  (issue.includedPostIds || []).forEach(function (pid) {
    postSet[pid] = true;
  });
  var posts = db.posts || [];
  for (var i = 0; i < posts.length; i++) {
    var p = posts[i];
    if (p && !p.deletedAt && postSet[p.id] && p.mediaIds && p.mediaIds.indexOf(mediaId) !== -1) {
      return true;
    }
  }
  return false;
}

function buildScopedGazettePayloadServer_(db, issue) {
  var postsMap = {};
  (db.posts || []).forEach(function (p) {
    if (p && p.id) postsMap[p.id] = p;
  });
  var profilesMap = {};
  (db.profiles || []).forEach(function (p) {
    if (p && p.id) profilesMap[p.id] = p;
  });
  var guestsMap = {};
  (db.rememberedPeople || []).forEach(function (g) {
    if (g && g.id) guestsMap[g.id] = g;
  });

  var posts = [];
  var contributorsById = {};
  var guestsById = {};

  function addContrib(pid) {
    if (!pid || contributorsById[pid] || !profilesMap[pid]) return;
    var p = profilesMap[pid];
    contributorsById[pid] = {
      id: p.id,
      name: p.name,
      relationLabel: p.relationLabel,
      avatarEmoji: p.avatarEmoji,
      avatarTheme: p.avatarTheme,
    };
  }

  (issue.includedPostIds || []).forEach(function (postId) {
    var post = postsMap[postId];
    if (!post || post.deletedAt) return;
    posts.push(post);
    addContrib(post.authorProfileId);
    (post.taggedProfileIds || []).forEach(addContrib);
    (post.taggedGuestIds || []).forEach(function (gid) {
      if (!gid || guestsById[gid] || !guestsMap[gid]) return;
      var g = guestsMap[gid];
      guestsById[gid] = {
        id: g.id,
        name: g.name,
        relationLabel: g.relationLabel,
        avatarEmoji: g.avatarEmoji,
      };
    });
  });

  return {
    issue: issue,
    familyName: (db.settings && db.settings.familyName) || 'FamilyGazette',
    gazetteSubtitle: db.settings ? db.settings.gazetteSubtitle : undefined,
    posts: posts,
    contributorsById: contributorsById,
    guestsById: guestsById,
  };
}

function dispatchRemindersInternal_(db, cycleKey, remindersByLanguage) {
  var recipients = {};
  (db.profiles || []).forEach(function (p) {
    if (p && !p.deletedAt && p.email && p.email.indexOf('@') > 0) {
      recipients[p.email.toLowerCase()] = {
        email: p.email,
        language: p.language === 'en' ? 'en' : 'fr',
      };
    }
  });
  (db.subscribers || []).forEach(function (s) {
    if (s && !s.deletedAt && s.active && s.email && s.email.indexOf('@') > 0) {
      recipients[s.email.toLowerCase()] = {
        email: s.email,
        language: s.language === 'en' ? 'en' : 'fr',
      };
    }
  });

  var sentCount = 0;
  var skippedCount = 0;
  var keys = Object.keys(recipients);
  for (var i = 0; i < keys.length; i++) {
    var rec = recipients[keys[i]];
    var rem =
      (remindersByLanguage && (remindersByLanguage[rec.language] || remindersByLanguage.fr || remindersByLanguage.en)) ||
      buildServerReminder_(rec.language, db.settings || {}, '', 0, '');
    if (!rem) {
      skippedCount += 1;
      continue;
    }
    MailApp.sendEmail(rec.email, rem.subject, rem.plainText || rem.subject, {
      htmlBody: rem.html,
      name: (db.settings && db.settings.familyName) || 'FamilyGazette',
    });
    sentCount += 1;
  }

  var now = new Date().toISOString();
  if (cycleKey && db.settings) {
    db.settings.lastReminderCycleKey = cycleKey;
    db.settings.updatedAt = now;
    db.updatedAt = now;
    writeDb_(db);
  }

  return {
    sentCount: sentCount,
    skippedCount: skippedCount,
    cycleKey: cycleKey,
  };
}

function computeNextScheduleServer_(settings, todayDateObj) {
  var cadence = settings.gazetteCadence || 'monthly';
  if (cadence === 'manual') {
    return { isReminderDueToday: false, nextPublishDate: '', cycleKey: '' };
  }
  var todayUtc = Date.UTC(todayDateObj.getUTCFullYear(), todayDateObj.getUTCMonth(), todayDateObj.getUTCDate());
  var todayIso = new Date(todayUtc).toISOString().slice(0, 10);
  var reminderDays = Math.min(14, Math.max(0, Number(settings.reminderDaysBefore || 3)));

  var nextUtc;
  if (cadence === 'monthly') {
    var targetDay = Math.min(28, Math.max(1, Number(settings.publishDayOfMonth || 1)));
    var d = new Date(todayUtc);
    if (d.getUTCDate() <= targetDay) {
      nextUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), targetDay);
    } else {
      nextUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, targetDay);
    }
  } else {
    var dayOfWeek = new Date(todayUtc).getUTCDay();
    var daysToSunday = (7 - dayOfWeek) % 7;
    nextUtc = todayUtc + daysToSunday * 86400000;
  }

  var nextIso = new Date(nextUtc).toISOString().slice(0, 10);
  var reminderIso = new Date(nextUtc - reminderDays * 86400000).toISOString().slice(0, 10);
  var cycleKey = cadence === 'monthly' ? nextIso.slice(0, 7) : nextIso;
  var alreadySent = settings.lastReminderCycleKey === cycleKey;

  return {
    nextPublishDate: nextIso,
    cycleKey: cycleKey,
    isReminderDueToday: todayIso === reminderIso && !alreadySent,
  };
}

function buildServerReminder_(lang, settings, nextDate, queuedCount, appUrl) {
  var familyName = settings.familyName || 'FamilyGazette';
  var title = settings.gazetteTitle || 'FamilyGazette';
  var isFr = lang !== 'en';
  var subject = isFr
    ? '⏰ Rappel ' + title + ' : publication le ' + nextDate
    : '⏰ ' + title + ' Reminder: publishing on ' + nextDate;
  var text = isFr
    ? 'Bonjour ! La prochaine Gazette de ' +
      familyName +
      ' paraît le ' +
      nextDate +
      '. Il y a déjà ' +
      queuedCount +
      ' souvenir(s) sélectionné(s). ' +
      appUrl
    : 'Hello! The next ' +
      familyName +
      ' Gazette publishes on ' +
      nextDate +
      '. ' +
      queuedCount +
      ' memory(s) queued so far. ' +
      appUrl;
  return {
    subject: subject,
    plainText: text,
    html: '<p style="font-family:sans-serif;font-size:15px;">' + text + '</p>',
  };
}

/* -------------------------------------------------------------------------- */
/*                               Drive I/O Helpers                            */
/* -------------------------------------------------------------------------- */

function ensureRootFolder_(props) {
  var existingId = props.getProperty(PROP_ROOT_FOLDER_ID);
  if (existingId) {
    try {
      var byId = DriveApp.getFolderById(existingId);
      if (byId && !byId.isTrashed()) return byId;
    } catch (e) {
      // recreate or search by name
    }
  }
  var iter = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (iter.hasNext()) {
    var found = iter.next();
    props.setProperty(PROP_ROOT_FOLDER_ID, found.getId());
    return found;
  }
  var created = DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty(PROP_ROOT_FOLDER_ID, created.getId());
  return created;
}

function findSubFolder_(parent, name) {
  var iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : null;
}

function ensureSubFolder_(parent, name) {
  var existing = findSubFolder_(parent, name);
  if (existing) return existing;
  return parent.createFolder(name);
}

function findFileInFolder_(folder, name) {
  var iter = folder.getFilesByName(name);
  return iter.hasNext() ? iter.next() : null;
}

function readDb_() {
  var props = PropertiesService.getScriptProperties();
  var root = ensureRootFolder_(props);
  var file = findFileInFolder_(root, DB_FILENAME);
  if (!file) {
    var fresh = createEmptyDb_(props.getProperty(PROP_INVITE_CODE) || 'FAM-2026');
    root.createFile(DB_FILENAME, JSON.stringify(fresh, null, 2), MimeType.PLAIN_TEXT);
    return fresh;
  }
  var raw = file.getBlob().getDataAsString('UTF-8');
  return JSON.parse(raw);
}

function writeDb_(db) {
  var root = ensureRootFolder_(PropertiesService.getScriptProperties());
  var file = findFileInFolder_(root, DB_FILENAME);
  var json = JSON.stringify(db);
  if (file) {
    file.setContent(json);
  } else {
    root.createFile(DB_FILENAME, json, MimeType.PLAIN_TEXT);
  }
}

function createEmptyDb_(inviteCode) {
  var now = new Date().toISOString();
  return {
    schemaVersion: 1,
    dbId: 'fgdb-server-' + generateRandomHex_(6),
    updatedAt: now,
    settings: {
      id: 'family_settings',
      familyName: 'Notre Famille',
      inviteCode: inviteCode,
      gazetteTitle: 'La Gazette de la Famille',
      gazetteSubtitle: 'Souvenirs mensuels partagés ensemble',
      gazetteCadence: 'monthly',
      publishDayOfMonth: 1,
      reminderDaysBefore: 3,
      gazetteTheme: 'editorial',
      lastCompiledIssueNumber: 0,
      updatedAt: now,
    },
    profiles: [],
    rememberedPeople: [],
    media: [],
    posts: [],
    comments: [],
    messages: [],
    messageReplies: [],
    subscribers: [],
    gazettes: [],
  };
}

function parseIsoMs_(iso) {
  if (!iso) return 0;
  var ms = Date.parse(iso);
  return isNaN(ms) ? 0 : ms;
}

function toBase64Url_(str) {
  return Utilities.base64EncodeWebSafe(str, Utilities.Charset.UTF_8).replace(/=+$/, '');
}

function toBase64UrlBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function generateRandomHex_(byteLen) {
  var out = '';
  for (var i = 0; i < byteLen; i++) {
    out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
  }
  return out;
}

function cloneJson_(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createRelayError_(code, message) {
  var err = new Error(message);
  err.errorCode = code;
  return err;
}

function errorResponse_(code, message) {
  return jsonResponse_({ ok: false, errorCode: code, error: message });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
