#!/bin/sh
set -eu

case " ${RENEWED_DOMAINS:-} " in
  *" groupdeal.tech "*|*" www.groupdeal.tech "*|*" groupdeal.thanhtan.top "*)
    /usr/sbin/nginx -t
    /bin/systemctl reload nginx
    ;;
esac
