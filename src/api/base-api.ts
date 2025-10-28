/*
 * Copyright (c) 2023, Terwer . All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * This code is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License version 2 only, as
 * published by the Free Software Foundation.  Terwer designates this
 * particular file as subject to the "Classpath" exception as provided
 * by Terwer in the LICENSE file that accompanied this code.
 *
 * This code is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * version 2 for more details (a copy is included in the LICENSE file that
 * accompanied this code).
 *
 * You should have received a copy of the GNU General Public License version
 * 2 along with this work; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * Please contact Terwer, Shenzhen, Guangdong, China, youweics@163.com
 * or visit www.terwer.space if you need additional information or have any
 * questions.
 */

import { createLogger } from "../utils/simple-logger";
import { isDev, siyuanApiToken, siyuanApiUrl } from "../utils/constants";

/**
 * SiYuan API response type
 */
export interface SiyuanData {
  /**
   * Non-zero indicates an error
   */
  code: number

  /**
   * Empty string when OK; error message if failed
   */
  msg: string

  /**
   * Can be {} / [] / NULL depending on the API
   */
  data: any[] | object | null | undefined
}

export class BaseApi {
  private logger;

  constructor() {
    this.logger = createLogger("base-api");
  }

  /**
   * Send a request to SiYuan
   *
   * @param url - api path
   * @param data - payload
   */
  public async siyuanRequest(url: string, data: object): Promise<SiyuanData> {
    const reqUrl = `${siyuanApiUrl}${url}`;

    const fetchOps = {
      body: JSON.stringify(data),
      method: "POST",
    };
    if (siyuanApiToken !== "") {
      Object.assign(fetchOps, {
        headers: {
          Authorization: `Token ${siyuanApiToken}`,
        },
      });
    }

    if (isDev) {
      this.logger.info("Requesting SiYuan =>", reqUrl);
      this.logger.info("Request options =>", fetchOps);
    }

    const response = await fetch(reqUrl, fetchOps);
    const resJson = (await response.json()) as SiyuanData;
    if (isDev) {
      this.logger.info("SiYuan response =>", resJson);
    }

    if (resJson.code === -1) {
      throw new Error(resJson.msg);
    }
    return resJson;
  }
}
