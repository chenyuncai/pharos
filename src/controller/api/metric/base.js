const BaseRest = require('../../rest.js');

const FIVE_MINS = 5 * 60 * 1000;
const ONE_HOUR = FIVE_MINS * 12;
const ONE_DAY = ONE_HOUR * 24;
const BETWEEN = {
  day: {
    delta: ONE_DAY,
    format: 'YYYY-MM-DD',
    transform: 'YYYY-MM-DD 00:00:00'
  },
  hour: {
    delta: ONE_HOUR,
    format: 'MM-DD HH:00',
    transform: 'YYYY-MM-DD HH:00:00'
  },
  mins: {
    delta: FIVE_MINS,
    format: 'MM-DD HH:mm',
    transform: 'YYYY-MM-DD HH:mm:00'
  }
};
class Base extends BaseRest {
  map(arr, keys, fn = _ => { }) {
    const data = {};
    function mapReduce(obj, keys, info = []) {
      if (keys.length) {
        for (const i in obj) {
          info.push([keys[0], i]);
          mapReduce(obj[i], keys.slice(1), info);
        }
        return;
      }

      const keyObj = {};
      const key = info.map(([k, v]) => {
        keyObj[k] = v;
        return v;
      }).join('/');

      if (data[key]) {
        for (var i in obj) {
          data[key][i] += obj[i];
        }
      } else {
        data[key] = { ...keyObj, ...obj };
      }
    }

    for (let i = 0; i < arr.length; i++) {
      mapReduce(arr[i], keys, []);
    }

    const result = [];
    for (var i in data) {
      const item = data[i];
      if (fn(item) === false) {
        continue;
      }
      result.push(item);
    }

    return result;
  }

  async groupWithPerf(site_id, data, cb) {
    if (think.isEmpty(data)) {
      return [];
    }

    const result = {};
    const perfs = await this.getPerfs(site_id);
    for (let i = 0; i < data.length; i++) {
      const perf = perfs[data[i].perf];
      if (!Array.isArray(result[perf])) {
        result[perf] = [];
      }
      result[perf].push(data[i]);
    }

    const output = [];
    for (const perf in result) {
      output.push({
        name: perf,
        data: cb(result[perf])
      });
    }

    return output;
  }

  avg({ time, count }, digit = 2) {
    const fixed = Math.pow(10, digit);
    return Math.round(time / count * fixed) / fixed;
  }

  async addData(data, create_time, indexs = []) {
    // 多机情况下查询是否已存在数据，并转成 indexs => value 的键值对
    const store = await this.modelInstance
      .where({ create_time })
      .select();

    const storeData = {};
    for (let i = 0; i < store.length; i++) {
      const { id, time, count } = store[i];
      const key = indexs.map(index => store[i][index]).join('/');
      storeData[key] = { id, time, count };
    }

    // 根据提取出来的数据情况对数据进行拆分，分为需要更新数据和新增数据
    const updateData = [];
    const addData = [];
    for (const i in data) {
      if (!storeData[i]) {
        addData.push(data[i]);
        continue;
      }

      if (data[i].time) {
        storeData[i].time += data[i].time;
      }
      if (data[i].count) {
        storeData[i].count += data[i].count;
      }
      updateData.push(storeData[i]);
    }

    if (!think.isEmpty(updateData)) {
      await this.modelInstance.updateMany(updateData);
    }
    if (!think.isEmpty(addData)) {
      await this.modelInstance.addMany(addData);
    }

    // const startTime = Date.now();
    // for (const i in data) {
    //   const {time, count, ...where} = data[i];
    //   const rows = await this.modelInstance.where(where).update({
    //     time: `time + ${time}`,
    //     count: `count + ${count}`
    //   });
    //   if (!rows) {
    //     await this.modelInstance.add(data[i]);
    //   }
    // }
    // think.logger.debug(`add data costs ${Date.now() - startTime}ms`);
  }

  async dataCollection(metric, indexs = []) {
    indexs = ['site_id', 'site_page_id', ...indexs];

    const startTime = Date.now();
    const createTime = think.datetime(Date.now(), 'YYYY-MM-DD HH:mm:00');
    think.logger.info('crontab', metric, createTime);

    const gatherData = await think.messenger.map(metric);
    const gatherMetric = {};
    for (let i = 0; i < gatherData.length; i++) {
      const data = gatherData[i];
      for (const item in data) {
        if (!gatherMetric[item]) {
          data[item].create_time = createTime;
          gatherMetric[item] = data[item];
        }

        if (data[item].time) {
          gatherMetric[item].time += data[item].time;
        }
        if (data[item].count) {
          gatherMetric[item].count += data[item].count;
        }
      }
    }
    if (think.isEmpty(gatherMetric)) {
      return think.logger.warn(`${metric} is empty`);
    }

    await this.addData(gatherMetric, createTime, indexs);
    think.logger.info(`${metric} crontab time: ${Date.now() - startTime}ms`);
    return this.success();
  }

  generateCates(start_time, end_time, type = 'day', format) {
    const { delta, transform } = BETWEEN[type] || BETWEEN['day'];
    format = format || BETWEEN[type].format;
    const startTime = new Date(think.datetime(new Date(start_time), transform)).getTime();
    const endTime = new Date(think.datetime(new Date(end_time), transform)).getTime();

    const times = [];
    for (let time = startTime; time < endTime; time += delta) {
      times.push(think.datetime(new Date(time), format));
    }
    return times;
  }
};

Base.BETWEEN = BETWEEN;
module.exports = Base;
