<?php
/**
 * Plugin Name: Elad CRM Visitor Tracking
 * Description: Stores website visitor sessions in WordPress and exposes them to the Elad CRM without using n8n.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ELAD_CRM_VISITORS_VERSION', '1.0.0');

function elad_crm_visitors_table_name() {
    global $wpdb;
    return $wpdb->prefix . 'elad_crm_visitors';
}

function elad_crm_visitors_install() {
    global $wpdb;

    $table = elad_crm_visitors_table_name();
    $charset = $wpdb->get_charset_collate();

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $sql = "CREATE TABLE {$table} (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        session_id VARCHAR(80) NOT NULL,
        landing_page TEXT NULL,
        referrer TEXT NULL,
        utm_source VARCHAR(120) NULL,
        utm_medium VARCHAR(120) NULL,
        utm_campaign VARCHAR(255) NULL,
        device_type VARCHAR(40) NULL,
        browser VARCHAR(80) NULL,
        time_on_site INT UNSIGNED DEFAULT 0,
        pages_visited LONGTEXT NULL,
        screen_width INT UNSIGNED DEFAULT 0,
        ip_address VARCHAR(80) NULL,
        city VARCHAR(120) NULL,
        region VARCHAR(120) NULL,
        country VARCHAR(120) NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY session_id (session_id),
        KEY created_at (created_at)
    ) {$charset};";

    dbDelta($sql);
    update_option('elad_crm_visitors_version', ELAD_CRM_VISITORS_VERSION);
}

register_activation_hook(__FILE__, 'elad_crm_visitors_install');

add_action('init', function () {
    if (get_option('elad_crm_visitors_version') !== ELAD_CRM_VISITORS_VERSION) {
        elad_crm_visitors_install();
    }
});

function elad_crm_visitors_client_ip() {
    $keys = array('HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR');
    foreach ($keys as $key) {
        if (empty($_SERVER[$key])) {
            continue;
        }
        $value = sanitize_text_field(wp_unslash($_SERVER[$key]));
        if ($key === 'HTTP_X_FORWARDED_FOR') {
            $parts = explode(',', $value);
            $value = trim($parts[0]);
        }
        if ($value) {
            return $value;
        }
    }
    return '';
}

function elad_crm_visitors_clean_text($value, $max = 255) {
    $value = sanitize_text_field((string) $value);
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max);
    }
    return substr($value, 0, $max);
}

function elad_crm_visitors_store(WP_REST_Request $request) {
    global $wpdb;

    $body = $request->get_json_params();
    if (!is_array($body)) {
        $body = array();
    }

    $session_id = elad_crm_visitors_clean_text($body['session_id'] ?? '', 80);
    if (!$session_id) {
        return new WP_REST_Response(array('ok' => false, 'error' => 'missing_session_id'), 400);
    }

    $pages = $body['pages_visited'] ?? array();
    if (!is_array($pages)) {
        $pages = array();
    }
    $pages = array_values(array_slice(array_map('esc_url_raw', $pages), 0, 20));

    $now = current_time('mysql', true);
    $data = array(
        'session_id' => $session_id,
        'landing_page' => esc_url_raw($body['landing_page'] ?? ''),
        'referrer' => esc_url_raw($body['referrer'] ?? ''),
        'utm_source' => elad_crm_visitors_clean_text($body['utm_source'] ?? '', 120),
        'utm_medium' => elad_crm_visitors_clean_text($body['utm_medium'] ?? '', 120),
        'utm_campaign' => elad_crm_visitors_clean_text($body['utm_campaign'] ?? '', 255),
        'device_type' => elad_crm_visitors_clean_text($body['device_type'] ?? '', 40),
        'browser' => elad_crm_visitors_clean_text($body['browser'] ?? '', 80),
        'time_on_site' => max(0, (int) ($body['time_on_site'] ?? 0)),
        'pages_visited' => wp_json_encode($pages),
        'screen_width' => max(0, (int) ($body['screen_width'] ?? 0)),
        'ip_address' => elad_crm_visitors_client_ip(),
        'city' => '',
        'region' => '',
        'country' => '',
        'updated_at' => $now,
    );

    $table = elad_crm_visitors_table_name();
    $existing_id = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE session_id = %s LIMIT 1", $session_id));

    if ($existing_id) {
        $wpdb->update($table, $data, array('id' => (int) $existing_id));
    } else {
        $data['created_at'] = $now;
        $wpdb->insert($table, $data);
    }

    return array('ok' => true);
}

function elad_crm_visitors_list(WP_REST_Request $request) {
    global $wpdb;

    $limit = min(5000, max(1, (int) $request->get_param('limit') ?: 5000));
    $table = elad_crm_visitors_table_name();
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d", $limit), ARRAY_A);

    foreach ($rows as &$row) {
        $decoded = json_decode($row['pages_visited'] ?? '[]', true);
        $row['pages_visited'] = is_array($decoded) ? $decoded : array();
        $row['time_on_site'] = (int) ($row['time_on_site'] ?? 0);
        $row['screen_width'] = (int) ($row['screen_width'] ?? 0);
    }

    return $rows;
}

add_action('rest_api_init', function () {
    register_rest_route('elad-crm/v1', '/visitor', array(
        'methods' => 'POST',
        'callback' => 'elad_crm_visitors_store',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('elad-crm/v1', '/visitors', array(
        'methods' => 'GET',
        'callback' => 'elad_crm_visitors_list',
        'permission_callback' => '__return_true',
    ));
});

add_filter('rest_pre_serve_request', function ($served, $result, $request, $server) {
    $route = $request instanceof WP_REST_Request ? $request->get_route() : '';
    if (strpos($route, '/elad-crm/v1/') === 0) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
    return $served;
}, 10, 4);

add_action('wp_footer', function () {
    if (is_admin()) {
        return;
    }
    ?>
<script>
(function () {
  'use strict';
  if (!window.fetch || !window.sessionStorage) return;

  var ENDPOINT = window.location.origin + '/wp-json/elad-crm/v1/visitor';
  var SESSION_KEY = 'elad_crm_vt_session';
  var SENT_KEY = 'elad_crm_vt_sent';
  var startTime = Date.now();
  var pages = [window.location.href];

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function sessionId() {
    var id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  function device() {
    var ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile';
    return 'desktop';
  }

  function browser() {
    var ua = navigator.userAgent || '';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Chrome/i.test(ua)) return 'Chrome';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Safari/i.test(ua)) return 'Safari';
    return 'Other';
  }

  function rememberPage() {
    var current = window.location.href;
    if (pages[pages.length - 1] !== current) pages.push(current);
  }

  var pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(history, arguments);
    rememberPage();
  };
  window.addEventListener('popstate', rememberPage);

  function payload() {
    return {
      session_id: sessionId(),
      landing_page: pages[0],
      referrer: document.referrer || '',
      utm_source: param('utm_source'),
      utm_medium: param('utm_medium'),
      utm_campaign: param('utm_campaign'),
      device_type: device(),
      browser: browser(),
      time_on_site: Math.round((Date.now() - startTime) / 1000),
      pages_visited: pages,
      screen_width: window.screen ? window.screen.width : 0
    };
  }

  function send() {
    if (sessionStorage.getItem(SENT_KEY)) return;
    sessionStorage.setItem(SENT_KEY, '1');
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
      keepalive: true
    }).catch(function () {});
  }

  setTimeout(send, 2500);
})();
</script>
    <?php
}, 99);
